const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      'create',
      'update',
      'status_change',
      'priority_change',
      'due_date_change',
      'tags_add',
      'tags_remove',
      'assignee_change',
      'collaborators_add',
      'collaborators_remove',
      'subtask_add',
      'subtask_delete',
      'move',
      'complete',
      'uncomplete',
      'delete',
      'reminder_set',
      'reminder_clear',
      'comment_add',
    ],
  },
  actor: {
    type: String,
    default: 'system',
    index: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

activityLogSchema.index({ taskId: 1, createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;
