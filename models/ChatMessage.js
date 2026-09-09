
const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  swap: { type: mongoose.Schema.Types.ObjectId, ref: 'Swap', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String },
  read: { type: Boolean, default: false },
  type: { type: String, enum: ['text', 'audio', 'file'], default: 'text' },
  audioUrl: { type: String },
  fileUrl: { type: String },
  fileName: { type: String },
  fileSize: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);