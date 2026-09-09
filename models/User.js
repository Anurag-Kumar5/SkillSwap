const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  // ======================
  // AUTHENTICATION
  // ======================
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: validator.isEmail,
      message: 'Please provide a valid email address'
    }
  },
  password: {
    type: String,
    select: false,
    minlength: [8, 'Password must be at least 8 characters'],
    validate: {
      validator: function(v) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(v);
      },
      message: 'Password must contain at least one uppercase, one lowercase, and one number'
    }
  },
  googleId: {
    type: String,
    select: false
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  verificationToken: {
    type: String,
    select: false
  },
  username: {
  type: String,
  unique: true,
  sparse: true, // Allows multiple null values but enforces uniqueness for non-null
  trim: true,
  minlength: [3, 'Username must be at least 3 characters'],
  maxlength: [30, 'Username cannot exceed 30 characters'],
  match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores']
},

  // ======================
  // PROFILE INFORMATION
  // ======================
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  avatar: {
    type: String,
    default: '/images/default-avatar.png'
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  timezone: String,
  age: {
    type: Number,
    min: [13, 'Must be at least 13 years old'],
    max: [120, 'Invalid age']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say', 'other'],
    default: 'prefer-not-to-say'
  },
  phone: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  socialLinks: {
    linkedin: { type: String, trim: true },
    twitter: { type: String, trim: true },
    github: { type: String, trim: true },
    instagram: { type: String, trim: true }
  },
  interests: [{
    type: String,
    trim: true
  }],
  languages: [{
    language: { type: String, required: true },
    proficiency: { 
      type: String, 
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Native'],
      default: 'Intermediate'
    }
  }],

  // ======================
  // SKILLS & SWAPPING
  // ======================
  skills: [{
    skill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  offeredSkills: [{
    skill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill'
    },
    proficiency: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      default: 'Intermediate'
    },
    description: String
  }],
  wantedSkills: [{
    skill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill'
    },
    priority: {
      type: Number,
      min: 1,
      max: 3,
      default: 2
    }
  }],
  requestedSwaps: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Swap'
  }],
  receivedSwaps: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Swap'
  }],

  // ======================
  // NOTIFICATIONS
  // ======================
  notifications: [{
    type: {
      type: String,
      enum: ['swap_request', 'swap_accepted', 'swap_rejected', 'swap_completed', 'message', 'system'],
      required: true
    },
    message: {
      type: String,
      required: true
    },
    swapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Swap'
    },
    link: String,
    read: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // not done yet //////////////////////////
  // ======================
  // REPUTATION SYSTEM
  // ======================
  ratings: {
    average: {
      type: Number,
      default: 5,
      min: 1,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    },
    breakdown: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 }
    }
  },
  badges: [{
    name: String,
    earnedAt: {
      type: Date,
      default: Date.now
    },
    description: String
  }],
  xpPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  level: {
    type: Number,
    default: 1,
    min: 1
  },

  // ======================
  // SYSTEM
  // ======================
  role: { 
    type: String, 
    enum: ['user', 'moderator', 'admin'], 
    default: 'user' 
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'banned'],
    default: 'active'
  },
  lastLogin: Date,
  activeSessions: [{
    device: String,
    ipAddress: String,
    token: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastUsed: Date
  }],
  privacy: {
    profileVisibility: {
      type: String,
      enum: ['public', 'members', 'private'],
      default: 'public'
    },
    skillVisibility: {
      type: String,
      enum: ['all', 'verified-only', 'none'],
      default: 'all'
    },
    showLastActive: {
      type: Boolean,
      default: true
    }
  },
  notificationsPrefs: {
    email: {
      newSwaps: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true }
    },
    push: {
      swapUpdates: { type: Boolean, default: true },
      newMessages: { type: Boolean, default: true }
    }
  },
  preferredContactMethods: {
    type: [String],
    enum: ['email', 'in-app', 'whatsapp', 'phone'],
    default: ['email', 'in-app']
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.googleId;
      delete ret.verificationToken;
      delete ret.activeSessions;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true },
  strictPopulate: false
});

// ======================
// VIRTUAL PROPERTIES
// ======================
userSchema.virtual('profileUrl').get(function() {
  return `/users/${this._id}`;
});

userSchema.virtual('swapCount').get(function () {
  const requested = Array.isArray(this.requestedSwaps) ? this.requestedSwaps.length : 0;
  const received = Array.isArray(this.receivedSwaps) ? this.receivedSwaps.length : 0;
  return requested + received;
});


// ======================
// INSTANCE METHODS
// ======================
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.updateLastLogin = function(ipAddress, device) {
  this.lastLogin = new Date();
  if (ipAddress && device) {
    this.activeSessions.push({ ipAddress, device });
  }
  return this.save();
};

userSchema.methods.hasSkill = function(skillId) {
  return this.skills.some(s => s.skill.equals(skillId));
};

userSchema.methods.addBadge = function(badgeName, description) {
  if (!this.badges.some(b => b.name === badgeName)) {
    this.badges.push({ 
      name: badgeName,
      description: description || '',
      earnedAt: new Date()
    });
  }
  return this.save();
};

userSchema.methods.addNotification = function(notification) {
  this.notifications.push(notification);
  return this.save();
};

// ======================
// STATIC METHODS
// ======================
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email }).select('+password +verificationToken');
};

userSchema.statics.getTopSwappers = function(limit = 10) {
  return this.find({})
    .sort({ xpPoints: -1 })
    .limit(limit)
    .select('name avatar xpPoints level');
};

// ======================
// MIDDLEWARE
// ======================
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.pre('save', function(next) {
  if (this.isModified('xpPoints')) {
    this.level = Math.floor(this.xpPoints / 100) + 1;
  }
  next();
});

// ======================
// INDEXES
// ======================
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ name: 'text', bio: 'text' });
userSchema.index({ 'skills.skill': 1 });
userSchema.index({ 'offeredSkills.skill': 1 });
userSchema.index({ 'wantedSkills.skill': 1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ xpPoints: -1 });

module.exports = mongoose.model('User', userSchema);