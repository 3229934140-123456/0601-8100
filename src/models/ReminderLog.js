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
  recipient: {
    type: String,
    index: true,
  },
  recipientType: {
    type: String,
    enum: ['assignee', 'collaborator', 'owner', 'other'],
    default: 'owner',
    index: true,
  },
}, {
  timestamps: true,
});

reminderLogSchema.index({ taskId: 1, remindAt: 1, recipient: 1 }, { unique: true });
reminderLogSchema.index({ recipient: 1, sentAt: -1 });

const ReminderLog = mongoose.model('ReminderLog', reminderLogSchema);

module.exports = ReminderLog;
