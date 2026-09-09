const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  message: { 
    type: String, 
    required: true 
  },
  swapId: {  
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Swap'
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  type: {  
    type: String,
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Notification', notificationSchema);