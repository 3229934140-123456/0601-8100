const mongoose = require('mongoose');

const reminderLogSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true,
  },
  remindAt: {
    type: Date,
    required: true,
    index: true,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  channel: {
    type: String,
    enum: ['email', 'push', 'sms', 'system'],
    default: 'system',
  },
  message: {
    type: String,
    default: '',
  },
  userId: {
    type: String,
    index: true,
  },
}, {
  timestamps: true,
});

reminderLogSchema.index({ taskId: 1, remindAt: 1 }, { unique: true });

const ReminderLog = mongoose.model('ReminderLog', reminderLogSchema);

module.exports = ReminderLog;
