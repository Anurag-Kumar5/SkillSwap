const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Swap = require('../models/Swap');
const Skill = require('../models/Skill');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { ensureAuthenticated } = require('../middlewares/auth');
const mongoose = require('mongoose');

/**
 * @route   POST /api/swaps
 * @desc    Create a new swap request
 * @access  Private
 */
router.post(
  '/',
  [
    body('recipientId').isMongoId().withMessage('Invalid recipient ID'),
    body('skillOfferedId').isMongoId().withMessage('Invalid offered skill ID'),
    body('skillRequestedId').isMongoId().withMessage('Invalid requested skill ID'),
    body('message').optional().isString().trim().escape().isLength({ max: 500 })
      .withMessage('Message must be less than 500 characters'),
    body('proposedTimes').optional().isArray(),
    body('location').optional().isString().trim().escape(),
    body('onlineMeetingLink').optional().isURL().withMessage('Invalid meeting link')
  ],
  ensureAuthenticated,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const { 
      recipientId, 
      skillOfferedId, 
      skillRequestedId, 
      message,
      proposedTimes,
      location,
      onlineMeetingLink
    } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Verify recipient exists
      const recipient = await User.findById(recipientId).select('_id name').session(session);
      if (!recipient) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          error: 'Recipient not found' 
        });
      }

      // Verify skills exist and belong to correct users
      const [offeredSkill, requestedSkill] = await Promise.all([
        Skill.findOne({ _id: skillOfferedId, user: req.user._id }).session(session),
        Skill.findOne({ _id: skillRequestedId, user: recipientId }).session(session)
      ]);

      if (!offeredSkill || !requestedSkill) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          error: 'Invalid skill selection' 
        });
      }

      // Check for existing pending swap
      const existingSwap = await Swap.findOne({
        requester: req.user._id,
        recipient: recipientId,
        skillRequested: skillRequestedId,
        status: 'pending'
      }).session(session);

      if (existingSwap) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          error: 'You already have a pending swap request for this skill' 
        });
      }

      // Create new swap
      const swap = new Swap({
        requester: req.user._id,
        recipient: recipientId,
        skillOffered: skillOfferedId,
        skillRequested: skillRequestedId,
        messages: message ? [{
          sender: req.user._id,
          text: message
        }] : [],
        meetingDetails: {
          proposedTimes: proposedTimes || [],
          location: location || '',
          onlineMeetingLink: onlineMeetingLink || ''
        },
        status: 'pending'
      });

      await swap.save({ session });

      // Create notification for recipient
      const notification = new Notification({
        recipient: recipientId,
        sender: req.user._id,
        type: 'swap_request',
        message: `${req.user.name} wants to swap skills with you`,
        swapId: swap._id
      });
      await notification.save();

      // Add notification to recipient
      await User.findByIdAndUpdate(recipientId, {
        $push: {
          notifications: {
            type: 'swap_request',
            message: `${req.user.name} wants to swap ${offeredSkill.name} for your ${requestedSkill.name}`,
            swapId: swap._id,
            read: false,
            createdAt: new Date()
          }
        }
      }).session(session);

      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: 'Swap request sent successfully',
        data: {
          id: swap._id,
          skillOffered: {
            id: offeredSkill._id,
            name: offeredSkill.name
          },
          skillRequested: {
            id: requestedSkill._id,
            name: requestedSkill.name
          },
          recipient: {
            id: recipient._id,
            name: recipient.name
          }
        }
      });

    } catch (err) {
      await session.abortTransaction();
      console.error('Create swap error:', err);
      res.status(500).json({ 
        success: false,
        error: 'Failed to create swap request',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    } finally {
      session.endSession();
    }
  }
);

/**
 * @route   GET /api/swaps
 * @desc    Get user's swaps with filtering and pagination
 * @access  Private
 */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    let query = {
      $or: [
        { requester: req.user._id },
        { recipient: req.user._id }
      ]
    };

    // Apply filters
    if (status && ['pending', 'accepted', 'rejected', 'completed'].includes(status)) {
      query.status = status;
    }

    if (type === 'sent') {
      query.requester = req.user._id;
    } else if (type === 'received') {
      query.recipient = req.user._id;
    }

    // Execute queries
    const [swaps, total] = await Promise.all([
      Swap.find(query)
        .skip(skip)
        .limit(Number(limit))
        .populate('skillOffered', 'name category')
        .populate('skillRequested', 'name category')
        .populate('requester', 'name avatar')
        .populate('recipient', 'name avatar')
        .populate('messages.sender', 'name avatar')
        .sort({ createdAt: -1 }),
      Swap.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: swaps,
      pagination: {
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        itemsPerPage: Number(limit)
      }
    });

  } catch (err) {
    console.error('Get swaps error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch swaps',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   GET /api/swaps/:id
 * @desc    Get detailed view of a single swap
 * @access  Private (participants only)
 */
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const swap = await Swap.findOne({
      _id: req.params.id,
      $or: [
        { requester: req.user._id },
        { recipient: req.user._id }
      ]
    })
      .populate('skillOffered skillRequested', 'name description category')
      .populate('requester recipient', 'name avatar email')
      .populate('messages.sender', 'name avatar');

    if (!swap) {
      return res.status(404).json({ 
        success: false,
        error: 'Swap not found or unauthorized' 
      });
    }

    res.json({ 
      success: true, 
      data: swap 
    });
  } catch (err) {
    console.error('Get swap error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch swap details' 
    });
  }
});

/**
 * @route   POST /api/swaps/:id/messages
 * @desc    Add message to a swap conversation
 * @access  Private (participants only)
 */
router.post(
  '/:id/messages',
  [
    body('text').trim().notEmpty().withMessage('Message cannot be empty')
  ],
  ensureAuthenticated,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const swap = await Swap.findOneAndUpdate(
        {
          _id: req.params.id,
          $or: [
            { requester: req.user._id },
            { recipient: req.user._id }
          ],
          status: { $ne: 'rejected' }
        },
        {
          $push: {
            messages: {
              sender: req.user._id,
              text: req.body.text
            }
          }
        },
        { new: true }
      ).populate('messages.sender', 'name avatar');

      if (!swap) {
        return res.status(404).json({ 
          success: false,
          error: 'Swap not found or unauthorized' 
        });
      }

      // Notify other participant via Socket.io in production
      res.json({ 
        success: true,
        message: 'Message added successfully',
        data: swap.messages[swap.messages.length - 1] 
      });
    } catch (err) {
      console.error('Add message error:', err);
      res.status(500).json({ 
        success: false,
        error: 'Failed to add message' 
      });
    }
  }
);

// Add a review to a completed swap (+10 XP to reviewer)
router.post(
  '/:id/reviews',
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('comment').optional().isString().isLength({ max: 1000 })
  ],
  ensureAuthenticated,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const swap = await Swap.findOne({
        _id: req.params.id,
        $or: [ { requester: req.user._id }, { recipient: req.user._id } ],
        status: 'completed'
      }).session(session);

      if (!swap) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, error: 'Swap not found or not completed' });
      }

      swap.reviews.push({
        reviewer: req.user._id,
        rating: req.body.rating,
        comment: req.body.comment || ''
      });
      await swap.save({ session });

      await User.findByIdAndUpdate(req.user._id, { $inc: { xpPoints: 10 } }, { session });

      // Create notification for the person being reviewed
      const revieweeId = swap.requester._id.equals(req.user._id) ? swap.recipient : swap.requester;
      const reviewNotification = new Notification({
        recipient: revieweeId,
        sender: req.user._id,
        type: 'review_received',
        message: `${req.user.name} left you a review`,
        swapId: swap._id
      });
      await reviewNotification.save();

      await session.commitTransaction();
      res.json({ success: true, message: 'Review added', xpAwarded: 10 });
    } catch (err) {
      await session.abortTransaction();
      console.error('Add review error:', err);
      res.status(500).json({ success: false, error: 'Failed to add review' });
    } finally {
      session.endSession();
    }
  }
);

/**
 * @route   PATCH /api/swaps/:id/status
 * @desc    Update swap status (accept/reject)
 * @access  Private (recipient only for pending swaps)
 */
router.patch(
  '/:id/status',
  [
    body('status')
      .isIn(['accepted', 'rejected', 'completed'])
      .withMessage('Status must be one of: accepted, rejected, completed')
  ],
  ensureAuthenticated,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const { status } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find and update the swap
      const statusFilter = (() => {
        if (status === 'accepted') {
          return { recipient: req.user._id, status: 'pending' };
        }
        if (status === 'completed') {
          return { $or: [ { requester: req.user._id }, { recipient: req.user._id } ], status: 'accepted' };
        }
        // rejected
        return { recipient: req.user._id, status: 'pending' };
      })();

      let swap = await Swap.findOneAndUpdate(
        {
          _id: req.params.id,
          ...statusFilter
        },
        { 
          status,
          $push: {
            messages: {
              sender: req.user._id,
              text: status === 'accepted' 
                ? 'Accepted your swap request!' 
                : (status === 'completed' ? 'Marked session as completed.' : 'Declined your swap request.')
            }
          }
        },
        { new: true, session }
      )
        .populate('skillOffered skillRequested', 'name')
        .populate('requester', 'name avatar');

      if (!swap) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          error: 'Swap not found or already processed'
        });
      }

      // If accepted, reject all other pending swaps for the same skill
      if (status === 'accepted') {
        await Swap.updateMany(
          {
            skillRequested: swap.skillRequested._id,
            status: 'pending',
            _id: { $ne: swap._id }
          },
          { status: 'rejected' },
          { session }
        );
      }

      // Create notification for requester
      const requesterNotification = new Notification({
        recipient: swap.requester._id,
        sender: req.user._id,
        type: `swap_${status}`,
        message: `Your swap request for ${swap.skillRequested.name} has been ${status}`,
        swapId: swap._id
      });
      await requesterNotification.save();

      // Add notification to requester (legacy)
      await User.findByIdAndUpdate(swap.requester._id, {
        $push: {
          notifications: {
            type: `swap_${status}`,
            message: `Your swap request for ${swap.skillRequested.name} has been ${status}`,
            swapId: swap._id,
            read: false,
            createdAt: new Date()
          }
        }
      }).session(session);

      // Award XP for accepting a swap (+20 XP) to the recipient
      if (status === 'accepted') {
        await User.findByIdAndUpdate(req.user._id, { $inc: { xpPoints: 20 } }).session(session);
      }

      // Award XP for completing a session (+50 XP) to BOTH users
      if (status === 'completed') {
        await User.updateMany(
          { _id: { $in: [swap.requester, swap.recipient] } },
          { $inc: { xpPoints: 50 } },
          { session }
        );
      }

      await session.commitTransaction();

      res.json({
        success: true,
        data: swap,
        message: `Swap ${status} successfully`,
        xpAwarded: status === 'accepted' ? 20 : (status === 'completed' ? 50 : 0)
      });

    } catch (err) {
      await session.abortTransaction();
      console.error('Update swap status error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to update swap status',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    } finally {
      session.endSession();
    }
  }
);

/**
 * @route   DELETE /api/swaps/:id
 * @desc    Cancel a swap (requester can cancel pending, both can cancel active)
 * @access  Private
 */
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const swap = await Swap.findOneAndDelete({
      _id: req.params.id,
      $or: [
        { 
          requester: req.user._id,
          status: 'pending'
        },
        {
          $and: [
            { $or: [{ requester: req.user._id }, { recipient: req.user._id }] },
            { status: { $in: ['accepted', 'completed'] } }
          ]
        }
      ]
    }).session(session);

    if (!swap) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: 'Swap not found or cannot be cancelled'
      });
    }

    // Notify the other user
    const otherUserId = swap.requester.equals(req.user._id) 
      ? swap.recipient 
      : swap.requester;

    await User.findByIdAndUpdate(otherUserId, {
      $push: {
        notifications: {
          type: 'swap_cancelled',
          message: `A swap ${swap.status === 'pending' ? 'request' : 'agreement'} was cancelled`,
          read: false,
          createdAt: new Date()
        }
      }
    }).session(session);

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Swap cancelled successfully'
    });

  } catch (err) {
    await session.abortTransaction();
    console.error('Cancel swap error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel swap',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    session.endSession();
  }
});

module.exports = router;