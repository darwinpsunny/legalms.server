const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  noticeType: {
    type: String,
    enum: ['Legal', 'Court', 'Administrative', 'Other'],
    default: 'Legal',
    required: true
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case'
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  issueDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  dueDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Pending', 'Acknowledged', 'Responded', 'Expired'],
    default: 'Pending',
    required: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
noticeSchema.index({ caseId: 1 });
noticeSchema.index({ clientId: 1 });
noticeSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.model('Notice', noticeSchema);




