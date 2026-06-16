const Task = require('../models/Task');

class RecurrenceService {
  calculateNextDueDate(currentDueDate, recurrence) {
    if (!recurrence.enabled || !recurrence.pattern || !currentDueDate) {
      return null;
    }

    const next = new Date(currentDueDate);
    const { pattern, interval = 1, weekdays = [] } = recurrence;

    switch (pattern) {
      case 'daily':
        next.setDate(next.getDate() + interval);
        break;

      case 'weekly':
        if (weekdays.length > 0) {
          const sortedWeekdays = [...weekdays].sort((a, b) => a - b);
          const currentDay = next.getDay();
          
          let found = false;
          for (const day of sortedWeekdays) {
            if (day > currentDay) {
              next.setDate(next.getDate() + (day - currentDay));
              found = true;
              break;
            }
          }
          
          if (!found) {
            const daysToAdd = (7 - currentDay + sortedWeekdays[0]) % 7 || 7;
            next.setDate(next.getDate() + daysToAdd + (interval - 1) * 7);
          }
        } else {
          next.setDate(next.getDate() + 7 * interval);
        }
        break;

      case 'monthly':
        next.setMonth(next.getMonth() + interval);
        break;

      case 'yearly':
        next.setFullYear(next.getFullYear() + interval);
        break;

      default:
        return null;
    }

    return next;
  }

  shouldGenerateNext(task) {
    if (!task.recurrence.enabled) return false;
    if (task.status !== 'completed') return false;
    if (!task.dueDate) return false;
    
    if (task.recurrence.endDate) {
      const nextDate = this.calculateNextDueDate(task.dueDate, task.recurrence);
      if (nextDate && nextDate > task.recurrence.endDate) {
        return false;
      }
    }
    
    if (task.recurrence.occurrences !== null && task.recurrence.occurrences !== undefined) {
      if ((task.recurrence.completedOccurrences || 0) >= task.recurrence.occurrences) {
        return false;
      }
    }
    
    return true;
  }

  async generateNextTask(task) {
    if (!this.shouldGenerateNext(task)) {
      return null;
    }

    const nextDueDate = this.calculateNextDueDate(task.dueDate, task.recurrence);
    if (!nextDueDate) return null;

    const originalTaskId = task.recurrence.originalTaskId || task._id;

    const newTask = new Task({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: 'pending',
      dueDate: nextDueDate,
      tags: [...task.tags],
      parentTask: task.parentTask,
      sortRank: task.sortRank,
      userId: task.userId,
      recurrence: {
        ...task.recurrence.toObject(),
        completedOccurrences: (task.recurrence.completedOccurrences || 0) + 1,
        originalTaskId,
      },
      reminder: task.reminder ? {
        enabled: task.reminder.enabled,
        remindAt: task.reminder.enabled && nextDueDate
          ? new Date(nextDueDate.getTime() - (task.dueDate - task.reminder.remindAt))
          : null,
        reminded: false,
      } : { enabled: false },
    });

    await newTask.save();

    if (task.parentTask) {
      const TaskService = require('./taskService');
      await TaskService.updateParentSubtaskCount(task.parentTask);
    }

    return newTask;
  }

  async processCompletedTasks() {
    const completedTasks = await Task.find({
      'recurrence.enabled': true,
      status: 'completed',
      dueDate: { $exists: true, $ne: null },
    });

    const generatedTasks = [];

    for (const task of completedTasks) {
      try {
        const newTask = await this.generateNextTask(task);
        if (newTask) {
          generatedTasks.push(newTask);
        }
      } catch (error) {
        console.error(`Error generating next task for ${task._id}:`, error);
      }
    }

    return generatedTasks;
  }

  async getRecurrencePreview(taskData, count = 5) {
    const dates = [];
    let currentDate = taskData.dueDate ? new Date(taskData.dueDate) : new Date();
    const recurrence = taskData.recurrence || { enabled: true, pattern: 'daily', interval: 1 };

    for (let i = 0; i < count; i++) {
      const nextDate = this.calculateNextDueDate(currentDate, recurrence);
      if (!nextDate) break;
      dates.push(nextDate);
      currentDate = nextDate;
    }

    return dates;
  }
}

module.exports = new RecurrenceService();
