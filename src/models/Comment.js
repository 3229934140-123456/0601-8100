const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000,
  },
  author: {
    type: String,
    default: 'default',
    index: true,
  },
  mentions: [{
    type: String,
    index: true,
  }],
}, {
  timestamps: true,
});

commentSchema.index({ taskId: 1, createdAt: -1 });
commentSchema.index({ mentions: 1 });

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;