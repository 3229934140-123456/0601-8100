const Task = require('../models/Task');
const ReminderLog = require('../models/ReminderLog');

class ReminderService {
  async getUpcomingReminders(windowMinutes = 60, userId = null) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

    const filter = {
      'reminder.enabled': true,
      'reminder.reminded': false,
      'reminder.remindAt': {
        $gte: now,
        $lte: windowEnd,
      },
      status: { $ne: 'completed' },
    };

    if (userId) {
      filter.userId = userId;
    }

    const tasks = await Task.find(filter)
      .sort({ 'reminder.remindAt': 1 })
      .lean();

    return tasks;
  }

  async processDueReminders() {
    const now = new Date();

    const tasksToRemind = await Task.find({
      'reminder.enabled': true,
      'reminder.reminded': false,
      'reminder.remindAt': { $lte: now },
      status: { $ne: 'completed' },
    });

    const results = [];

    for (const task of tasksToRemind) {
      try {
        const reminderLog = new ReminderLog({
          taskId: task._id,
          remindAt: task.reminder.remindAt,
          channel: 'system',
          message: `Reminder: "${task.title}" is due soon!`,
          userId: task.userId,
        });
        await reminderLog.save();

        task.reminder.reminded = true;
        await task.save();

        this.sendNotification(task, reminderLog);

        results.push({
          taskId: task._id,
          title: task.title,
          remindAt: task.reminder.remindAt,
          sent: true,
        });
      } catch (error) {
        console.error(`Error sending reminder for task ${task._id}:`, error);
        results.push({
          taskId: task._id,
          error: error.message,
          sent: false,
        });
      }
    }

    return results;
  }

  sendNotification(task, reminderLog) {
    console.log(`[REMINDER] Task "${task.title}" is due at ${task.dueDate}`);
    console.log(`  User: ${task.userId}`);
    console.log(`  Priority: ${task.priority}`);
    console.log(`  Reminder sent at: ${new Date().toISOString()}`);
  }

  async setReminder(taskId, reminderConfig, userId = 'default') {
    const task = await Task.findOne({ _id: taskId, userId });
    if (!task) {
      throw new Error('Task not found');
    }

    const { minutesBefore, remindAt } = reminderConfig;
    let finalRemindAt = null;
    const finalMinutesBefore = minutesBefore || null;

    if (finalMinutesBefore && task.dueDate) {
      finalRemindAt = new Date(new Date(task.dueDate).getTime() - finalMinutesBefore * 60 * 1000);
    } else if (remindAt) {
      finalRemindAt = new Date(remindAt);
    }

    if (!finalRemindAt) {
      throw new Error('Either minutesBefore with dueDate or remindAt is required');
    }

    task.reminder = {
      enabled: true,
      minutesBefore: finalMinutesBefore,
      remindAt: finalRemindAt,
      reminded: false,
    };

    await task.save();
    return task;
  }

  async clearReminder(taskId, userId = 'default') {
    const task = await Task.findOne({ _id: taskId, userId });
    if (!task) {
      throw new Error('Task not found');
    }

    task.reminder = {
      enabled: false,
      minutesBefore: null,
      remindAt: null,
      reminded: false,
    };

    await task.save();
    return task;
  }

  async getReminderHistory(taskId, userId = 'default') {
    const task = await Task.findOne({ _id: taskId, userId });
    if (!task) {
      throw new Error('Task not found');
    }

    const logs = await ReminderLog.find({ taskId })
      .sort({ sentAt: -1 })
      .limit(20)
      .lean();

    return logs;
  }

  async getOverdueTasks(userId = 'default') {
    const now = new Date();

    const tasks = await Task.find({
      userId,
      dueDate: { $lt: now },
      status: { $nin: ['completed', 'cancelled'] },
    })
      .sort({ dueDate: 1 })
      .lean();

    return tasks;
  }

  async getTasksDueToday(userId = 'default') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const tasks = await Task.find({
      userId,
      dueDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'completed' },
    })
      .sort({ dueDate: 1 })
      .lean();

    return tasks;
  }
}

module.exports = new ReminderService();
