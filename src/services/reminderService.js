const Task = require('../models/Task');
const ReminderLog = require('../models/ReminderLog');

function getRecipients(task) {
  const recipients = [];
  const assignee = task.assignee;
  const collaborators = task.collaborators || [];
  const owner = task.userId;

  if (assignee) {
    recipients.push({ user: assignee, type: 'assignee' });
  }
  for (const c of collaborators) {
    if (c === assignee) continue;
    recipients.push({ user: c, type: 'collaborator' });
  }
  if (!assignee && collaborators.length === 0 && owner) {
    recipients.push({ user: owner, type: 'owner' });
  }
  return recipients;
}

class ReminderService {
  async getUpcomingReminders(windowMinutes = 60, userId = null, participant = null) {
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
    if (participant) {
      if (!filter.$or) filter.$or = [];
      filter.$or.push({ assignee: participant }, { collaborators: participant });
    }

    const tasks = await Task.find(filter)
      .sort({ 'reminder.remindAt': 1 })
      .lean();

    for (const t of tasks) {
      t.reminder.recipients = getRecipients(t);
    }

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
        const recipients = getRecipients(task);
        const sentRecipients = [];

        for (const rcpt of recipients) {
          try {
            const existing = await ReminderLog.findOne({
              taskId: task._id,
              remindAt: task.reminder.remindAt,
              recipient: rcpt.user,
            });
            if (existing) continue;

            const reminderLog = new ReminderLog({
              taskId: task._id,
              remindAt: task.reminder.remindAt,
              channel: 'system',
              message: `[${rcpt.type === 'assignee' ? '负责人' : rcpt.type === 'collaborator' ? '协作者' : '所有者'}提醒] "${task.title}" 即将到期`,
              userId: task.userId,
              recipient: rcpt.user,
              recipientType: rcpt.type,
            });
            await reminderLog.save();
            this.sendNotification(task, reminderLog);
            sentRecipients.push({ user: rcpt.user, type: rcpt.type });
          } catch (e) {
            console.error(`Failed to log reminder for ${rcpt.user} on task ${task._id}:`, e.message);
          }
        }

        task.reminder.reminded = true;
        await task.save();

        results.push({
          taskId: task._id,
          title: task.title,
          remindAt: task.reminder.remindAt,
          assignee: task.assignee || null,
          collaborators: task.collaborators || [],
          recipients: sentRecipients,
          sent: sentRecipients.length > 0,
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
    const label = reminderLog.recipientType === 'assignee' ? '负责人'
      : reminderLog.recipientType === 'collaborator' ? '协作者'
      : '所有者';
    console.log(`[REMINDER] [${label}→${reminderLog.recipient}] Task "${task.title}" is due at ${task.dueDate}`);
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

  async getReminderHistory(taskId, userId = 'default', { recipient = null, recipientType = null, limit = 50 } = {}) {
    const task = await Task.findOne({ _id: taskId, userId });
    if (!task) {
      throw new Error('Task not found');
    }

    const filter = { taskId };
    if (recipient) filter.recipient = recipient;
    if (recipientType) filter.recipientType = recipientType;

    const logs = await ReminderLog.find(filter)
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();

    return logs.map(log => ({
      ...log,
      recipientLabel: log.recipientType === 'assignee' ? '负责人'
        : log.recipientType === 'collaborator' ? '协作者'
        : log.recipientType === 'owner' ? '所有者' : '其他',
    }));
  }

  async getRemindersForUser(user, { limit = 50 } = {}) {
    const logs = await ReminderLog.find({ recipient: user })
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();

    return logs.map(log => ({
      ...log,
      recipientLabel: log.recipientType === 'assignee' ? '负责人'
        : log.recipientType === 'collaborator' ? '协作者'
        : log.recipientType === 'owner' ? '所有者' : '其他',
    }));
  }

  async getOverdueTasks(userId = 'default', participant = null) {
    const now = new Date();

    const filter = {
      userId,
      dueDate: { $lt: now },
      status: { $nin: ['completed', 'cancelled'] },
    };

    if (participant) {
      filter.$or = [
        { assignee: participant },
        { collaborators: participant },
      ];
    }

    const tasks = await Task.find(filter)
      .sort({ dueDate: 1 })
      .lean();

    return tasks;
  }

  async getTasksDueToday(userId = 'default', participant = null) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const filter = {
      userId,
      dueDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'completed' },
    };

    if (participant) {
      filter.$or = [
        { assignee: participant },
        { collaborators: participant },
      ];
    }

    const tasks = await Task.find(filter)
      .sort({ dueDate: 1 })
      .lean();

    return tasks;
  }
}

module.exports = new ReminderService();
