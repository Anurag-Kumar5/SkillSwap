const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Skill = require('../models/Skill'); 
const Swap = require('../models/Swap');
const Notification = require('../models/Notification');  
const ChatMessage = require('../models/ChatMessage');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { ensureAuthenticated, ensureGuest } = require('../middlewares/auth');

// Home Route - Now handles both logged in and guest users
router.get('/', (req, res) => {
  res.render('home', { 
    user: req.user,
    messages: req.flash() 
  });
});

// Login Routes
router.get('/login', ensureGuest, (req, res) => {
  res.render('auth/login', {
    messages: req.flash(),
    isAdminLogin: req.query.admin === 'true',
    oldInput: {
      email: '',
      password: ''
    }
  });
});

router.post('/login', ensureGuest, async (req, res, next) => {
  const { email, password, isAdmin } = req.body;
  const sanitizedEmail = email.toLowerCase().trim();

  try {
    // Input validation
    if (!email || !password) {
      req.flash('error', 'Email and password are required');
      return res.render('auth/login', {
        isAdminLogin: !!isAdmin,
        messages: req.flash(),
        oldInput: req.body
      });
    }

    if (isAdmin) {
      const admin = await Admin.findOne({ email: sanitizedEmail });
      
      if (!admin) {
        req.flash('error', 'Invalid admin credentials');
        return res.render('auth/login', {
          isAdminLogin: true,
          messages: req.flash(),
          oldInput: req.body
        });
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        req.flash('error', 'Invalid admin credentials');
        return res.render('auth/login', {
          isAdminLogin: true,
          messages: req.flash(),
          oldInput: req.body
        });
      }

      req.login(admin, (err) => {
        if (err) return next(err);
        const redirectTo = req.session.returnTo || '/admin/dashboard';
        delete req.session.returnTo;
        req.flash('success', 'Admin login successful');
        return res.redirect(redirectTo);
      });

    } else {
      passport.authenticate('user-local', (err, user, info) => {
        if (err) return next(err);
        if (!user) {
          req.flash('error', (info && info.message) || 'Invalid credentials');
          return res.render('auth/login', {
            isAdminLogin: false,
            messages: req.flash(),
            oldInput: req.body
          });
        }
        req.logIn(user, (err) => {
          if (err) return next(err);
          const redirectTo = req.session.returnTo || '/profile';
          delete req.session.returnTo;
          req.flash('success', 'Login successful');
          return res.redirect(redirectTo);
        });
      })(req, res, next);
    }
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'An error occurred during login');
    res.redirect('/login');
  }
});

// Signup Routes
router.get('/signup', ensureGuest, (req, res) => {
  res.render('auth/signup', {
    messages: req.flash(),
    oldInput: {
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
    }
  });
});

router.post('/signup', ensureGuest, async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  const sanitizedEmail = email.toLowerCase().trim();

  try {
    // Validation
    if (!username || !email || !password || !confirmPassword) {
      req.flash('error', 'All fields are required');
      return res.render('auth/signup', {
        messages: req.flash(),
        oldInput: req.body
      });
    }

    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters');
      return res.render('auth/signup', {
        messages: req.flash(),
        oldInput: req.body
      });
    }

    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match');
      return res.render('auth/signup', {
        messages: req.flash(),
        oldInput: req.body
      });
    }

    const existingUser = await User.findOne({ 
      $or: [{ email: sanitizedEmail }, { username }] 
    });

    if (existingUser) {
      req.flash('error', 'Email or username already exists');
      return res.render('auth/signup', {
        messages: req.flash(),
        oldInput: req.body
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({ 
      username, 
      email: sanitizedEmail, 
      password: hashedPassword,
      name: username // Adding name field from username
    });

    await newUser.save();

    // Auto-login after signup
    req.login(newUser, (err) => {
      if (err) {
        req.flash('success', 'Account created! Please login');
        return res.redirect('/login');
      }
      req.flash('success', 'Account created successfully!');
      return res.redirect('/');
    });

  } catch (err) {
    console.error('Signup error:', err);
    req.flash('error', 'Account creation failed. Please try again.');
    res.render('auth/signup', {
      messages: req.flash(),
      oldInput: req.body
    });
  }
});

// Google Auth
router.get('/auth/google', ensureGuest, passport.authenticate('google', { 
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

router.get('/auth/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: '/login',
    failureFlash: true 
  }),
  (req, res) => {
    const redirectTo = req.session.returnTo || '/profile';
    delete req.session.returnTo;
    req.flash('success', 'Google login successful');
    res.redirect(redirectTo);
  }
);

// Profile Route

router.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    // Get all required data in parallel
    const [
      populatedUser,
      pendingSwapsCount, 
      unreadCount,
      rawSwaps,
      notifications
    ] = await Promise.all([
      // Populate user skills (using lean() for simpler data handling)
      User.findById(req.user._id)
        .populate({
          path: 'skills.skill',
          select: 'name category description proficiency createdAt'
        })
        .lean(),
      
      // Count pending swaps
      Swap.countDocuments({
        recipient: req.user._id,
        status: 'pending'
      }),
      
      // Count unread notifications
      Notification.countDocuments({
        recipient: req.user._id,
        read: false
      }),
      
      // Get active swaps with safety checks
      Swap.find({
        $or: [
          { requester: req.user._id },
          { recipient: req.user._id }
        ],
        status: { $nin: ['completed', 'rejected'] },
        recipient: { $exists: true, $ne: null } // Ensure recipient exists
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate([
        { 
          path: 'skillOffered',
          select: 'name category user',
          populate: { path: 'user', select: 'name avatar' }
        },
        {
          path: 'skillRequested',
          select: 'name category user',
          populate: { path: 'user', select: 'name avatar' }
        },
        { path: 'recipient', select: 'name avatar _id' },
        { path: 'requester', select: 'name avatar _id' }
      ])
      .lean(),
      
      // Get recent notifications
      Notification.find({
        recipient: req.user._id
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('sender', 'name avatar')
      .lean()
    ]);

    // Safely transform skills
    const transformedSkills = (populatedUser?.skills || [])
      .filter(skillObj => skillObj?.skill) // Filter out null skills
      .map(skillObj => {
        // Handle both Mongoose documents and plain objects
        const skill = skillObj.skill;
        return {
          ...(typeof skill.toObject === 'function' ? skill.toObject() : skill),
          addedAt: skillObj.addedAt
        };
      })
      .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    // Filter out any swaps with invalid populated fields
    const swaps = (rawSwaps || []).filter(swap => 
      swap?.recipient?._id && 
      swap?.requester?._id
    );

    res.render('profile', {
      user: {
        ...populatedUser,
        skills: transformedSkills
      },
      swaps,
      pendingSwapsCount: pendingSwapsCount || 0,
      unreadCount: unreadCount || 0,
      notifications: notifications || [],
      messages: req.flash(),
      proficiencyLevels: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      currentPath: '/profile'
    });

  } catch (err) {
    console.error('Profile error:', err);
    req.flash('error', 'Error loading profile data');
    res.redirect('/');
  }
});
// Add this new route for fetching user skills (used in swap modal)
router.get('/profile/skills', ensureAuthenticated, async (req, res) => {
  try {
    const skills = await Skill.find({ user: req.user._id })
      .select('name category _id');
    res.json(skills);
  } catch (err) {
    console.error('Error fetching user skills:', err);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Profile edit
router.get('/profile/edit', ensureAuthenticated, async (req, res) => {
  res.render('profile-edit', {
    user: req.user,
    messages: req.flash()
  });
});

router.post('/profile/edit', ensureAuthenticated, async (req, res) => {
  try {
    const { 
      name, bio, location, avatar, age, gender,
      linkedin, twitter, github, instagram, interests
    } = req.body;
    
    // Process interests (split by comma and trim)
    const interestsArray = interests 
      ? interests.split(',').map(interest => interest.trim()).filter(interest => interest.length > 0)
      : [];
    
    // Build social links object
    const socialLinks = {
      linkedin: linkedin || '',
      twitter: twitter || '',
      github: github || '',
      instagram: instagram || ''
    };
    
    const updateData = {
      name: name?.trim() || req.user.name,
      bio: bio || '',
      location: location || '',
      avatar: avatar || req.user.avatar,
      age: age ? parseInt(age) : undefined,
      gender: gender || 'prefer-not-to-say',
      socialLinks: socialLinks,
      interests: interestsArray
    };
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    await User.findByIdAndUpdate(req.user._id, updateData, { runValidators: true });
    req.flash('success', 'Profile updated successfully');
    res.redirect('/profile');
  } catch (err) {
    console.error('Profile update error:', err);
    req.flash('error', 'Failed to update profile: ' + (err.message || 'Unknown error'));
    res.redirect('/profile/edit');
  }
});

// User Profile View
router.get('/users/:userId', ensureAuthenticated, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password -email -notifications -activeSessions');
    
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/leaderboard');
    }
    
    // Get user's skills
    const skills = await Skill.find({ user: userId });
    
    res.render('user-profile', { 
      profileUser: user, 
      skills,
      currentUser: req.user 
    });
  } catch (err) {
    console.error('User profile error:', err);
    req.flash('error', 'Failed to load user profile');
    res.redirect('/leaderboard');
  }
});

// Reviews
router.get('/reviews', ensureAuthenticated, async (req, res) => {
  try {
    const Review = require('../models/Review');
    const reviews = await Review.find({})
      .populate('reviewer', 'name avatar')
      .populate('reviewee', 'name')
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.render('reviews', { reviews });
  } catch (err) {
    console.error('Reviews error:', err);
    req.flash('error', 'Failed to load reviews');
    res.redirect('/profile');
  }
});

// Unread notification count
router.get('/notifications/unread-count', ensureAuthenticated, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      recipient: req.user._id, 
      read: false 
    });
    res.json({ count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.json({ count: 0 });
  }
});

// Notifications
router.get('/notifications', ensureAuthenticated, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .populate('sender', 'name avatar')
      .lean();
    res.render('notifications', { user: req.user, notifications, messages: req.flash() });
  } catch (err) {
    console.error('Notifications error:', err);
    req.flash('error', 'Failed to load notifications');
    res.redirect('/profile');
  }
});

router.post('/notifications/:id/read', ensureAuthenticated, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

router.post('/notifications/read-all', ensureAuthenticated, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

router.get('/notifications/unread-count', ensureAuthenticated, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ count: 0 });
  }
});

// Swaps page (web)
router.get('/swaps', ensureAuthenticated, async (req, res) => {
  try {
    const swaps = await Swap.find({
      $or: [
        { requester: req.user._id },
        { recipient: req.user._id }
      ]
    })
      .populate('skillOffered', 'name category')
      .populate('skillRequested', 'name category')
      .populate('requester', 'name avatar')
      .populate('recipient', 'name avatar')
      .sort({ createdAt: -1 })
      .lean();

    res.render('swaps/list', {
      user: req.user,
      swaps,
      messages: req.flash()
    });
  } catch (err) {
    console.error('Swaps page error:', err);
    req.flash('error', 'Failed to load swaps');
    res.redirect('/profile');
  }
});

// Chat page for a swap
router.get('/swaps/:id/chat', ensureAuthenticated, async (req, res) => {
  try {
    const swap = await Swap.findOne({
      _id: req.params.id,
      $or: [ { requester: req.user._id }, { recipient: req.user._id } ]
    })
    .populate('requester', 'name avatar')
    .populate('recipient', 'name avatar')
    .populate('skillOffered', 'name')
    .populate('skillRequested', 'name')
    .lean();

    if (!swap) {
      req.flash('error', 'Swap not found');
      return res.redirect('/swaps');
    }

    res.render('swaps/chat', { user: req.user, swap, messages: req.flash() });
  } catch (err) {
    console.error('Chat page error:', err);
    req.flash('error', 'Failed to load chat');
    res.redirect('/swaps');
  }
});

// Logout
router.get('/logout', ensureAuthenticated, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash('success', 'Logged out successfully');
    res.redirect('/');
  });
});

router.get('/skills', ensureAuthenticated, async (req, res) => {
  try {
    const skills = await Skill.find({ user: req.user._id })
      .select('name category _id description proficiency')
      .lean();
    
    res.json({
      success: true,
      data: skills // Frontend expects this structure
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load skills' 
    });
  }
});


router.get('/browse', ensureAuthenticated, async (req, res) => {
  try {
    const { q = '', category = '', proficiency = '' } = req.query;

    const query = { user: { $ne: req.user._id } };
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ];
    }
    if (category) query.category = category;
    if (proficiency) query.proficiency = proficiency;

    const [skills, categories] = await Promise.all([
      Skill.find(query)
        .populate('user', 'name avatar')
        .sort({ createdAt: -1 }),
      Skill.distinct('category', { user: { $ne: req.user._id } })
    ]);

    res.render('browse', {
      user: { 
        ...req.user.toObject(), 
        skills: await Skill.find({ user: req.user._id })
      },
      skills,
      categories,
      query: { q, category, proficiency }
    });

  } catch (err) {
    console.error('Browse error:', err);
    req.flash('error', 'Error loading skills');
    res.redirect('/');
  }
});

// Leaderboard page
router.get('/leaderboard', ensureAuthenticated, async (req, res) => {
  try {
    const top = await User.getTopSwappers(20).lean();
    res.render('leaderboard', { user: req.user, top, messages: req.flash() });
  } catch (err) {
    console.error('Leaderboard page error:', err);
    req.flash('error', 'Failed to load leaderboard');
    res.redirect('/profile');
  }
});

// Swaps API moved to routes/swaps.js. Duplicate routes removed to avoid conflicts.

// API Routes for Chat
router.get('/api/chats/:swapId', ensureAuthenticated, async (req, res) => {
  try {
    // Verify user has access to this chat
    const swap = await Swap.findOne({
      _id: req.params.swapId,
      $or: [
        { requester: req.user._id },
        { recipient: req.user._id }
      ]
    });

    if (!swap) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const messages = await ChatMessage.find({ swap: req.params.swapId })
      .sort({ createdAt: 1 })
      .populate('sender', 'name avatar');

    res.json(messages);

  } catch (err) {
    console.error('Error fetching chat messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/api/chats', ensureAuthenticated, async (req, res) => {
  try {
    const { swapId, recipientId, text, type, audioUrl, fileUrl, fileName, fileSize } = req.body;

    // Validate inputs
    if (!swapId || !recipientId || (!text && !audioUrl && !fileUrl)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify user has access to this chat
    const swap = await Swap.findOne({
      _id: swapId,
      $or: [
        { requester: req.user._id },
        { recipient: req.user._id }
      ]
    });

    if (!swap) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Create new message
    const message = new ChatMessage({
      swap: swapId,
      sender: req.user._id,
      recipient: recipientId,
      text: text || '',
      type: type || (audioUrl ? 'audio' : (fileUrl ? 'file' : 'text')),
      audioUrl: audioUrl || undefined,
      fileUrl: fileUrl || undefined,
      fileName: fileName || undefined,
      fileSize: fileSize || undefined
    });

    await message.save();

    // Populate sender info
    await message.populate('sender', 'name avatar');

    // Update swap last activity
    swap.lastMessageAt = new Date();
    await swap.save();

    // Emit socket event
    req.io.to(recipientId.toString()).emit('newMessage', {
      swapId,
      senderId: req.user._id,
      senderName: req.user.name,
      message: {
        _id: message._id,
        text: message.text,
        type: message.type,
        audioUrl: message.audioUrl,
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileSize: message.fileSize,
        createdAt: message.createdAt,
        sender: message.sender
      }
    });

    res.json(message);

  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});


// Simple upload endpoint for files/audio stored under public/uploads
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2,8)}_${safeBase}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

router.post('/api/upload', ensureAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const relativeUrl = `/uploads/${req.file.filename}`;
    return res.json({ url: relativeUrl, name: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Leaderboard API (Top users by XP)
router.get('/api/leaderboard', async (req, res) => {
  try {
    const top = await User.getTopSwappers(20);
    res.json({ success: true, data: top });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;