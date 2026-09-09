const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Skill = require('../models/Skill');
const User = require('../models/User');
const Swap = require('../models/Swap');
const { ensureAuthenticated } = require('../middlewares/auth');

// Constants
const SKILL_CATEGORIES = ['Tech', 'Music', 'Art', 'Language', 'Cooking', 'Other'];
const PROFICIENCY_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const ITEMS_PER_PAGE = 9;

// Helper function for error handling
const handleError = (res, err, redirectPath) => {
  console.error(err);
  const message = err.name === 'ValidationError' 
    ? Object.values(err.errors).map(e => e.message).join(', ')
    : 'An error occurred. Please try again.';
  req.flash('error', message);
  res.redirect(redirectPath);
};

// Add Skill Form
router.get('/add', ensureAuthenticated, (req, res) => {
  res.render('skills/add', { 
    categories: SKILL_CATEGORIES,
    proficiencyLevels: PROFICIENCY_LEVELS,
    messages: req.flash(),
    user: req.user 
  });
});

// Process Add Skill
router.post('/', ensureAuthenticated, async (req, res) => {
  const { name, category, description, proficiency } = req.body;
  
  if (!name || !category) {
    req.flash('error', 'Skill name and category are required');
    return res.redirect('/skills/add');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const skill = await Skill.create([{
      name,
      category,
      description: description || '',
      proficiency: proficiency || 'Beginner',
      user: req.user._id
    }], { session });

    await User.findByIdAndUpdate(
      req.user._id,
      { $push: { skills: { skill: skill[0]._id } } },
      { session }
    );

    // Award XP for creating a skill listing (+10 XP)
    await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { xpPoints: 10 } },
      { session }
    );

    await session.commitTransaction();
    req.flash('success', 'Skill added successfully! +10 XP');
    res.redirect('/profile?xp=10&event=skill_add');
  } catch (err) {
    await session.abortTransaction();
    handleError(res, err, '/skills/add');
  } finally {
    session.endSession();
  }
});

// List All Skills with Pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * ITEMS_PER_PAGE;

    const [skills, total] = await Promise.all([
      Skill.find()
        .populate('user', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(ITEMS_PER_PAGE),
      Skill.countDocuments()
    ]);

    res.render('skills/list', {
      skills,
      currentPage: page,
      totalPages: Math.ceil(total / ITEMS_PER_PAGE),
      messages: req.flash(),
      user: req.user
    });
  } catch (err) {
    handleError(res, err, '/');
  }
});

// View Single Skill
router.get('/:id', async (req, res) => {
  try {
    const skill = await Skill.findById(req.params.id)
      .populate('user', 'name email');
    
    if (!skill) {
      req.flash('error', 'Skill not found');
      return res.redirect('/skills');
    }
    
    res.render('skills/view', {
      skill,
      user: req.user,
      isOwner: req.user && req.user._id.equals(skill.user._id)
    });
  } catch (err) {
    handleError(res, err, '/skills');
  }
});

// Edit Skill Form
router.get('/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const skill = await Skill.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!skill) {
      req.flash('error', 'Skill not found or unauthorized');
      return res.redirect('/profile');
    }
    
    res.render('skills/edit', {
      skill,
      categories: SKILL_CATEGORIES,
      proficiencyLevels: PROFICIENCY_LEVELS,
      messages: req.flash(),
      user: req.user
    });
  } catch (err) {
    handleError(res, err, '/profile');
  }
});

// Update Skill
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { name, category, description, proficiency } = req.body;
    
    if (!name || !category) {
      req.flash('error', 'Skill name and category are required');
      return res.redirect(`/skills/${req.params.id}/edit`);
    }
    
    const updatedSkill = await Skill.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { 
        name, 
        category, 
        description, 
        proficiency,
        updatedAt: Date.now() 
      },
      { 
        new: true,
        runValidators: true
      }
    );
    
    if (!updatedSkill) {
      req.flash('error', 'Skill not found or unauthorized');
      return res.redirect('/profile');
    }
    
    req.flash('success', 'Skill updated successfully!');
    res.redirect(`/skills/${req.params.id}`);
  } catch (err) {
    handleError(res, err, `/skills/${req.params.id}/edit`);
  }
});

// Delete Skill
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const skill = await Skill.findOne({
      _id: req.params.id,
      user: req.user._id
    }).session(session);

    if (!skill) {
      await session.abortTransaction();
      if (req.accepts('html')) {
        return res.status(404).render('error', { error: 'Skill not found or unauthorized', user: req.user });
      }
      return res.status(404).json({ 
        success: false,
        error: 'Skill not found or unauthorized' 
      });
    }

    const activeSwaps = await Swap.countDocuments({
      $or: [
        { skillOffered: req.params.id, status: { $in: ['pending', 'accepted'] } },
        { skillRequested: req.params.id, status: { $in: ['pending', 'accepted'] } }
      ]
    }).session(session);

    if (activeSwaps > 0) {
      await session.abortTransaction();
      if (req.accepts('html')) {
        return res.status(400).render('error', { error: 'Cannot delete skill involved in active swaps', user: req.user });
      }
      return res.status(400).json({ 
        success: false,
        error: 'Cannot delete skill involved in active swaps' 
      });
    }

    await Skill.deleteOne({ _id: req.params.id }).session(session);
    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { skills: { skill: req.params.id } } },
      { session }
    );
    await Swap.deleteMany({
      $or: [
        { skillOffered: req.params.id },
        { skillRequested: req.params.id }
      ]
    }).session(session);

    await session.commitTransaction();

    if (req.accepts('html')) {
      req.flash('success', 'Skill deleted successfully!');
      res.redirect('/profile');
    } else {
      res.json({ success: true, message: 'Skill deleted successfully' });
    }
  } catch (err) {
    await session.abortTransaction();
    console.error('Delete skill error:', err);
    
    if (req.accepts('html')) {
      return res.status(500).render('error', { error: 'Failed to delete skill', user: req.user });
    }
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete skill' 
    });
  } finally {
    session.endSession();
  }
});

// Search Skills
router.get('/search', async (req, res) => {
  try {
    const { q, category } = req.query;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * ITEMS_PER_PAGE;

    const query = {
      $or: [
        { name: { $regex: q || '', $options: 'i' } },
        { description: { $regex: q || '', $options: 'i' } }
      ]
    };

    if (category && SKILL_CATEGORIES.includes(category)) {
      query.category = category;
    }

    const [skills, total] = await Promise.all([
      Skill.find(query)
        .populate('user', 'name')
        .skip(skip)
        .limit(ITEMS_PER_PAGE),
      Skill.countDocuments(query)
    ]);

    res.render('skills/search', {
      skills,
      searchQuery: q,
      selectedCategory: category,
      categories: SKILL_CATEGORIES,
      currentPage: page,
      totalPages: Math.ceil(total / ITEMS_PER_PAGE),
      user: req.user
    });
  } catch (err) {
    handleError(res, err, '/skills');
  }
});

// (removed) Duplicate browse route. Using main route in authRoutes.js

// Handle swap requests
router.post('/swap-request', ensureAuthenticated, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { skillId, recipientId, skillOfferedId, message } = req.body;
    
    const swap = await Swap.create([{
      requester: req.user._id,
      recipient: recipientId,
      skillOffered: skillOfferedId,
      skillRequested: skillId,
      message: message || '',
      status: 'pending'
    }], { session });

    await User.findByIdAndUpdate(
      recipientId,
      { $push: { 
        notifications: {
          type: 'swap_request',
          message: `New swap request for your skill`,
          swapId: swap[0]._id,
          read: false,
          createdAt: new Date()
        }
      }},
      { session }
    );

    await session.commitTransaction();
    res.json({ success: true, swapId: swap[0]._id });
  } catch (err) {
    await session.abortTransaction();
    console.error('Swap request error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create swap request',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    session.endSession();
  }
});

module.exports = router;