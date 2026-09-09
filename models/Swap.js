const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const swapSchema = new Schema({
  requester: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Requester is required'],
    validate: {
      validator: async function(userId) {
        const user = await mongoose.model('User').findById(userId);
        return user !== null;
      },
      message: 'Invalid requester user ID'
    }
  },
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required'],
    validate: {
      validator: async function(userId) {
        const user = await mongoose.model('User').findById(userId);
        return user !== null;
      },
      message: 'Invalid recipient user ID'
    }
  },
  skillOffered: {
    type: Schema.Types.ObjectId,
    ref: 'Skill',
    required: [true, 'Offered skill is required'],
    validate: {
      validator: async function(skillId) {
        const skill = await mongoose.model('Skill').findById(skillId);
        return skill !== null;
      },
      message: 'Invalid offered skill ID'
    }
  },
  skillRequested: {
    type: Schema.Types.ObjectId,
    ref: 'Skill',
    required: [true, 'Requested skill is required'],
    validate: {
      validator: async function(skillId) {
        const skill = await mongoose.model('Skill').findById(skillId);
        return skill !== null;
      },
      message: 'Invalid requested skill ID'
    }
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'accepted', 'rejected', 'completed', 'cancelled'],
      message: 'Invalid swap status'
    },
    default: 'pending'
  },
  messages: [{
    sender: { 
      type: Schema.Types.ObjectId, 
      ref: 'User',
      required: [true, 'Message sender is required']
    },
    text: {
      type: String,
      required: [true, 'Message text is required'],
      maxlength: [500, 'Message cannot exceed 500 characters']
    },
    sentAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  reviews: [{
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 1000, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],
  meetingDetails: {
    proposedTimes: [Date],
    agreedTime: Date,
    location: String,
    onlineMeetingLink: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted createdAt date
swapSchema.virtual('createdAtFormatted').get(function() {
  return this.createdAt.toLocaleString();
});

// Virtual for checking if swap is active
swapSchema.virtual('isActive').get(function() {
  return ['pending', 'accepted'].includes(this.status);
});

// Indexes for optimized queries
swapSchema.index({ requester: 1, status: 1 });
swapSchema.index({ recipient: 1, status: 1 });
swapSchema.index({ createdAt: -1 });
swapSchema.index({ 'meetingDetails.agreedTime': 1 });

// Pre-save hook to update timestamps
swapSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Helper method to add a message
swapSchema.methods.addMessage = async function(senderId, text) {
  this.messages.push({ sender: senderId, text });
  await this.save();
  return this;
};

// Static method to find active swaps for a user
swapSchema.statics.findActiveSwaps = function(userId) {
  return this.find({
    $or: [{ requester: userId }, { recipient: userId }],
    status: { $in: ['pending', 'accepted'] }
  }).populate('requester recipient skillOffered skillRequested');
};

// Static method to count pending requests for a user
swapSchema.statics.countPendingRequests = function(userId) {
  return this.countDocuments({ recipient: userId, status: 'pending' });
};

module.exports = mongoose.model('Swap', swapSchema);