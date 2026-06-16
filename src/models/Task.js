const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending',
  },
  dueDate: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  parentTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null,
    index: true,
  },
  subtaskCount: {
    type: Number,
    default: 0,
  },
  completedSubtaskCount: {
    type: Number,
    default: 0,
  },
  sortRank: {
    type: String,
    required: true,
    index: true,
  },
  recurrence: {
    enabled: {
      type: Boolean,
      default: false,
    },
    pattern: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly', null],
      default: null,
    },
    interval: {
      type: Number,
      default: 1,
    },
    weekdays: [{
      type: Number,
      min: 0,
      max: 6,
    }],
    endDate: {
      type: Date,
      default: null,
    },
    occurrences: {
      type: Number,
      default: null,
    },
    completedOccurrences: {
      type: Number,
      default: 0,
    },
    originalTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
  },
  reminder: {
    enabled: {
      type: Boolean,
      default: false,
    },
    minutesBefore: {
      type: Number,
      default: null,
    },
    remindAt: {
      type: Date,
      default: null,
    },
    reminded: {
      type: Boolean,
      default: false,
    },
  },
  userId: {
    type: String,
    default: 'default',
    index: true,
  },
}, {
  timestamps: true,
});

taskSchema.index({ parentTask: 1, sortRank: 1 });
taskSchema.index({ userId: 1, status: 1, dueDate: 1 });
taskSchema.index({ userId: 1, priority: 1 });
taskSchema.index({ tags: 1 });
taskSchema.index({ 'reminder.enabled': 1, 'reminder.remindAt': 1, 'reminder.reminded': 1 });
taskSchema.index({ 'recurrence.enabled': 1, dueDate: 1 });

taskSchema.virtual('subtasks', {
  ref: 'Task',
  localField: '_id',
  foreignField: 'parentTask',
  options: { sort: { sortRank: 1 } },
});

taskSchema.set('toJSON', { virtuals: true });
taskSchema.set('toObject', { virtuals: true });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
