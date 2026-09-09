const mongoose = require('mongoose');
const validator = require('validator');

const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Skill name is required'],
    trim: true,
    maxlength: [50, 'Skill name cannot exceed 50 characters'],
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9\s\-]+$/.test(v); // Alphanumeric with spaces and hyphens
      },
      message: 'Skill name contains invalid characters'
    }
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: ['Tech', 'Music', 'Art', 'Language', 'Cooking', 'Other'],
      message: '{VALUE} is not a valid category'
    }
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    trim: true
  },
  proficiency: {
    type: String,
    required: [true, 'Proficiency level is required'],
    enum: {
      values: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      message: '{VALUE} is not a valid proficiency level'
    },
    default: 'Intermediate'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    immutable: true
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

//  Compound index to prevent duplicate skills for the same user
skillSchema.index({ name: 1, user: 1 }, { unique: true });

//  Virtual: Formatted created date (safe with null check)
skillSchema.virtual('createdAtFormatted').get(function() {
  return this.createdAt
    ? this.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '';
});

//  Query Helper: Filter by proficiency
skillSchema.query.byProficiency = function(level) {
  return this.where({ proficiency: level });
};

//  Instance Method: Return skill details
skillSchema.methods.getDetails = function() {
  return {
    name: this.name,
    category: this.category,
    proficiency: this.proficiency,
    description: this.description || 'No description provided'
  };
};

//  Pre-save Hook: Capitalize skill name
skillSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.name = this.name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  next();
});

module.exports = mongoose.model('Skill', skillSchema);
