const Task = require('../models/Task');
const { generateInitialRank, rankBetween, compareRanks, rebalanceRanks } = require('../utils/lexoRank');

class TaskService {
  async createTask(taskData, userId = 'default') {
    const { parentTask: parentTaskId, reminder, ...rest } = taskData;
    
    let sortRank;
    if (parentTaskId) {
      const parent = await Task.findById(parentTaskId);
      if (!parent) {
        throw new Error('Parent task not found');
      }
      const siblings = await Task.find({ parentTask: parentTaskId })
        .sort({ sortRank: 1 })
        .select('sortRank');
      
      if (siblings.length === 0) {
        sortRank = generateInitialRank();
      } else {
        const lastRank = siblings[siblings.length - 1].sortRank;
        sortRank = rankBetween(lastRank, null);
      }
    } else {
      const rootTasks = await Task.find({ parentTask: null, userId })
        .sort({ sortRank: 1 })
        .select('sortRank');
      
      if (rootTasks.length === 0) {
        sortRank = generateInitialRank();
      } else {
        const lastRank = rootTasks[rootTasks.length - 1].sortRank;
        sortRank = rankBetween(lastRank, null);
      }
    }

    let reminderConfig = { enabled: false, minutesBefore: null, remindAt: null, reminded: false };
    if (reminder && reminder.enabled && rest.dueDate) {
      const minutesBefore = reminder.minutesBefore || null;
      let remindAt = reminder.remindAt ? new Date(reminder.remindAt) : null;
      if (minutesBefore && rest.dueDate) {
        remindAt = new Date(new Date(rest.dueDate).getTime() - minutesBefore * 60 * 1000);
      }
      if (remindAt) {
        reminderConfig = { enabled: true, minutesBefore, remindAt, reminded: false };
      }
    } else if (reminder && reminder.enabled && reminder.remindAt) {
      reminderConfig = {
        enabled: true,
        minutesBefore: reminder.minutesBefore || null,
        remindAt: new Date(reminder.remindAt),
        reminded: false,
      };
    }

    const task = new Task({
      ...rest,
      parentTask: parentTaskId || null,
      sortRank,
      userId,
      reminder: reminderConfig,
    });

    await task.save();

    if (parentTaskId) {
      await this.updateParentSubtaskCount(parentTaskId);
    }

    return await this.getTaskWithSubtasks(task._id, userId);
  }

  async getTaskWithSubtasks(taskId, userId = 'default', depth = 3) {
    const task = await Task.findOne({ _id: taskId, userId });
    if (!task) return null;

    const taskObj = task.toObject();
    
    if (depth > 0) {
      const subtasks = await Task.find({ parentTask: taskId })
        .sort({ sortRank: 1 });
      
      taskObj.subtasks = [];
      for (const subtask of subtasks) {
        const subtaskWithChildren = await this.getTaskWithSubtasks(subtask._id, userId, depth - 1);
        if (subtaskWithChildren) {
          taskObj.subtasks.push(subtaskWithChildren);
        }
      }
    }

    this.attachProgress(taskObj);

    return taskObj;
  }

  attachProgress(taskObj) {
    if (taskObj.subtasks && taskObj.subtasks.length > 0) {
      let totalAll = 0;
      let completedAll = 0;
      for (const sub of taskObj.subtasks) {
        this.attachProgress(sub);
        totalAll += (sub.progress.totalSubtasks || 0) + 1;
        completedAll += (sub.progress.completedSubtasks || 0) + (sub.status === 'completed' ? 1 : 0);
      }
      taskObj.progress = {
        totalSubtasks: totalAll,
        completedSubtasks: completedAll,
        uncompletedSubtasks: totalAll - completedAll,
        completionPercentage: totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0,
      };
    } else {
      taskObj.progress = {
        totalSubtasks: 0,
        completedSubtasks: 0,
        uncompletedSubtasks: 0,
        completionPercentage: taskObj.status === 'completed' ? 100 : 0,
      };
    }
    return taskObj;
  }

  async getTasksGrouped(query = {}, userId = 'default') {
    const { status, priority, tags, search } = query;

    const baseFilter = { userId };
    if (status) baseFilter.status = status;
    if (priority) baseFilter.priority = priority;
    if (tags && tags.length > 0) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      baseFilter.tags = { $all: tagsArray };
    }
    if (search) {
      baseFilter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(now); tomorrowStart.setDate(tomorrowStart.getDate() + 1); tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(now);
    const daysUntilSunday = 7 - now.getDay();
    weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);
    weekEnd.setHours(23, 59, 59, 999);

    const groups = {};

    const overdueFilter = { ...baseFilter, dueDate: { $lt: todayStart }, status: { $nin: ['completed', 'cancelled'] } };
    if (status) delete overdueFilter.status;
    groups.overdue = await Task.find(overdueFilter).sort({ dueDate: 1 }).lean();

    const todayFilter = { ...baseFilter, dueDate: { $gte: todayStart, $lte: todayEnd } };
    groups.today = await Task.find(todayFilter).sort({ sortRank: 1 }).lean();

    const tomorrowFilter = { ...baseFilter, dueDate: { $gte: tomorrowStart, $lte: tomorrowEnd } };
    groups.tomorrow = await Task.find(tomorrowFilter).sort({ sortRank: 1 }).lean();

    const thisWeekFilter = { ...baseFilter, dueDate: { $gt: tomorrowEnd, $lte: weekEnd } };
    groups.thisWeek = await Task.find(thisWeekFilter).sort({ dueDate: 1 }).lean();

    const noDueDateFilter = { ...baseFilter, dueDate: null };
    groups.noDueDate = await Task.find(noDueDateFilter).sort({ sortRank: 1 }).lean();

    const laterFilter = { ...baseFilter, dueDate: { $gt: weekEnd } };
    groups.later = await Task.find(laterFilter).sort({ dueDate: 1 }).lean();

    const summary = {};
    for (const [key, tasks] of Object.entries(groups)) {
      summary[key] = tasks.length;
    }

    return { groups, summary };
  }

  async getTasks(query = {}, userId = 'default') {
    const {
      status,
      priority,
      tags,
      dueDateFrom,
      dueDateTo,
      parentTask,
      search,
      sortBy = 'sortRank',
      sortOrder = 'asc',
      page = 1,
      limit = 50,
      includeSubtasks = false,
      grouped = false,
      includeProgress = false,
    } = query;

    if (grouped) {
      return await this.getTasksGrouped(query, userId);
    }

    const filter = { userId };
    
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (parentTask !== undefined) filter.parentTask = parentTask || null;
    
    if (tags && tags.length > 0) {
      const tagsArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $all: tagsArray };
    }
    
    if (dueDateFrom || dueDateTo) {
      filter.dueDate = {};
      if (dueDateFrom) filter.dueDate.$gte = new Date(dueDateFrom);
      if (dueDateTo) filter.dueDate.$lte = new Date(dueDateTo);
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    if (sortBy !== 'sortRank') {
      sort.sortRank = 1;
    }

    const skip = (page - 1) * limit;

    if (sortBy === 'progress' && !parentTask) {
      filter.parentTask = null;
    }

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Task.countDocuments(filter),
    ]);

    if (includeSubtasks || includeProgress) {
      for (const task of tasks) {
        if (includeSubtasks) {
          task.subtasks = await this.getAllSubtasks(task._id);
        }
        if (includeProgress) {
          const progress = await this.calculateTaskProgress(task._id);
          task.progress = progress;
        }
      }
    }

    if (sortBy === 'progress') {
      for (const task of tasks) {
        if (!task.progress) {
          task.progress = await this.calculateTaskProgress(task._id);
        }
      }
      tasks.sort((a, b) => {
        const pa = a.progress.completionPercentage;
        const pb = b.progress.completionPercentage;
        return sortOrder === 'desc' ? pb - pa : pa - pb;
      });
    }

    return {
      tasks,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  async calculateTaskProgress(taskId) {
    const allSubtasks = await this.getAllSubtasksFlat(taskId);
    const total = allSubtasks.length;
    const completed = allSubtasks.filter(s => s.status === 'completed').length;
    return {
      totalSubtasks: total,
      completedSubtasks: completed,
      uncompletedSubtasks: total - completed,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  async getAllSubtasksFlat(parentId) {
    const directSubtasks = await Task.find({ parentTask: parentId }).lean();
    const allSubtasks = [];
    for (const sub of directSubtasks) {
      allSubtasks.push(sub);
      const nested = await this.getAllSubtasksFlat(sub._id);
      allSubtasks.push(...nested);
    }
    return allSubtasks;
  }

  async getAllSubtasks(parentId) {
    const subtasks = await Task.find({ parentTask: parentId })
      .sort({ sortRank: 1 })
      .lean();
    
    for (const subtask of subtasks) {
      subtask.subtasks = await this.getAllSubtasks(subtask._id);
    }
    
    return subtasks;
  }

  async batchUpdate(taskIds, updateData, userId = 'default') {
    const results = { succeeded: [], failed: [] };

    for (const taskId of taskIds) {
      try {
        const task = await this.updateTask(taskId, updateData, userId);
        results.succeeded.push({ taskId, task });
      } catch (error) {
        results.failed.push({ taskId, error: error.message });
      }
    }

    return {
      total: taskIds.length,
      succeededCount: results.succeeded.length,
      failedCount: results.failed.length,
      succeeded: results.succeeded.map(r => r.taskId),
      failed: results.failed.map(r => ({ taskId: r.taskId, error: r.error })),
    };
  }

  async batchAddTags(taskIds, tagsToAdd, userId = 'default') {
    const results = { succeeded: [], failed: [] };
    const tagsArray = Array.isArray(tagsToAdd) ? tagsToAdd : [tagsToAdd];

    for (const taskId of taskIds) {
      try {
        const task = await Task.findOne({ _id: taskId, userId });
        if (!task) {
          results.failed.push({ taskId, error: 'Task not found' });
          continue;
        }
        const currentTags = task.tags || [];
        const newTags = [...new Set([...currentTags, ...tagsArray])];
        task.tags = newTags;
        await task.save();
        results.succeeded.push(taskId);
      } catch (error) {
        results.failed.push({ taskId, error: error.message });
      }
    }

    return {
      total: taskIds.length,
      succeededCount: results.succeeded.length,
      failedCount: results.failed.length,
      succeeded: results.succeeded,
      failed: results.failed,
    };
  }

  async batchRemoveTags(taskIds, tagsToRemove, userId = 'default') {
    const results = { succeeded: [], failed: [] };
    const tagsArray = Array.isArray(tagsToRemove) ? tagsToRemove : [tagsToRemove];

    for (const taskId of taskIds) {
      try {
        const task = await Task.findOne({ _id: taskId, userId });
        if (!task) {
          results.failed.push({ taskId, error: 'Task not found' });
          continue;
        }
        task.tags = (task.tags || []).filter(t => !tagsArray.includes(t));
        await task.save();
        results.succeeded.push(taskId);
      } catch (error) {
        results.failed.push({ taskId, error: error.message });
      }
    }

    return {
      total: taskIds.length,
      succeededCount: results.succeeded.length,
      failedCount: results.failed.length,
      succeeded: results.succeeded,
      failed: results.failed,
    };
  }

  async batchDelete(taskIds, userId = 'default') {
    const results = { succeeded: [], failed: [] };

    for (const taskId of taskIds) {
      try {
        await this.deleteTask(taskId, userId);
        results.succeeded.push(taskId);
      } catch (error) {
        results.failed.push({ taskId, error: error.message });
      }
    }

    return {
      total: taskIds.length,
      succeededCount: results.succeeded.length,
      failedCount: results.failed.length,
      succeeded: results.succeeded,
      failed: results.failed,
    };
  }

  async updateTask(taskId, updateData, userId = 'default') {
    const task = await Task.findOne({ _id: taskId, userId });
    if (!task) {
      throw new Error('Task not found');
    }

    const oldStatus = task.status;
    const oldParent = task.parentTask;
    const { status, parentTask, reminder, ...rest } = updateData;

    if (status !== undefined && status !== oldStatus) {
      task.status = status;
      if (status === 'completed') {
        task.completedAt = new Date();
        await this.completeAllSubtasks(taskId);
      } else if (oldStatus === 'completed') {
        task.completedAt = null;
        await this.uncompleteAllSubtasks(taskId);
      }
    }

    if (parentTask !== undefined && parentTask !== oldParent) {
      if (parentTask) {
        const newParent = await Task.findOne({ _id: parentTask, userId });
        if (!newParent) {
          throw new Error('New parent task not found');
        }
        await this.checkCircularReference(taskId, parentTask);
      }
      
      if (oldParent) {
        await this.updateParentSubtaskCount(oldParent);
      }
      
      const siblings = await Task.find({ parentTask: parentTask || null })
        .sort({ sortRank: 1 })
        .select('sortRank');
      
      if (siblings.length === 0) {
        task.sortRank = generateInitialRank();
      } else {
        const lastRank = siblings[siblings.length - 1].sortRank;
        task.sortRank = rankBetween(lastRank, null);
      }
      
      task.parentTask = parentTask || null;
    }

    if (reminder !== undefined) {
      if (reminder === null || reminder.enabled === false) {
        task.reminder = { enabled: false, minutesBefore: null, remindAt: null, reminded: false };
      } else if (reminder.enabled) {
        let remindAt = reminder.remindAt ? new Date(reminder.remindAt) : null;
        const minutesBefore = reminder.minutesBefore || null;
        const dueDate = rest.dueDate || task.dueDate;
        if (minutesBefore && dueDate) {
          remindAt = new Date(new Date(dueDate).getTime() - minutesBefore * 60 * 1000);
        }
        if (remindAt) {
          task.reminder = {
            enabled: true,
            minutesBefore,
            remindAt,
            reminded: false,
          };
        }
      }
    }

    Object.assign(task, rest);
    await task.save();

    if (task.parentTask) {
      await this.updateParentSubtaskCount(task.parentTask);
      await this.checkParentAutoComplete(task.parentTask);
    } else if (oldParent) {
      await this.updateParentSubtaskCount(oldParent);
      await this.checkParentAutoComplete(oldParent);
    }

    if (status !== undefined && status === 'completed' && oldStatus !== 'completed') {
      if (task.recurrence && task.recurrence.enabled) {
        const RecurrenceService = require('./recurrenceService');
        await RecurrenceService.generateNextTask(task);
      }
    }

    return await this.getTaskWithSubtasks(task._id, userId);
  }

  async checkCircularReference(taskId, newParentId) {
    let currentId = newParentId;
    while (currentId) {
      if (currentId.toString() === taskId.toString()) {
        throw new Error('Circular reference detected: cannot move task under its own subtask');
      }
      const task = await Task.findById(currentId).select('parentTask');
      currentId = task ? task.parentTask : null;
    }
  }

  async completeAllSubtasks(parentId) {
    const subtasks = await Task.find({ parentTask: parentId });
    for (const subtask of subtasks) {
      if (subtask.status !== 'completed') {
        subtask.status = 'completed';
        subtask.completedAt = new Date();
        await subtask.save();
        await this.completeAllSubtasks(subtask._id);
      }
    }
  }

  async uncompleteAllSubtasks(parentId) {
    const subtasks = await Task.find({ parentTask: parentId });
    for (const subtask of subtasks) {
      if (subtask.status === 'completed') {
        subtask.status = 'pending';
        subtask.completedAt = null;
        await subtask.save();
        await this.uncompleteAllSubtasks(subtask._id);
      }
    }
  }

  async updateParentSubtaskCount(parentId) {
    const subtasks = await Task.find({ parentTask: parentId });
    const completedCount = subtasks.filter(s => s.status === 'completed').length;
    
    await Task.findByIdAndUpdate(parentId, {
      subtaskCount: subtasks.length,
      completedSubtaskCount: completedCount,
    });
  }

  async checkParentAutoComplete(parentId) {
    const parent = await Task.findById(parentId);
    if (!parent) return;

    const subtasks = await Task.find({ parentTask: parentId });
    
    if (subtasks.length === 0) return;

    const allCompleted = subtasks.every(s => s.status === 'completed');
    const hasCompleted = subtasks.some(s => s.status === 'completed');

    let parentChanged = false;

    if (allCompleted && parent.status !== 'completed') {
      parent.status = 'completed';
      parent.completedAt = new Date();
      parentChanged = true;
    } else if (!allCompleted && parent.status === 'completed') {
      parent.status = hasCompleted ? 'in_progress' : 'pending';
      parent.completedAt = null;
      parentChanged = true;
    } else if (!allCompleted && hasCompleted && parent.status === 'pending') {
      parent.status = 'in_progress';
      parentChanged = true;
    } else if (!hasCompleted && parent.status === 'in_progress') {
      parent.status = 'pending';
      parentChanged = true;
    }

    if (parentChanged) {
      await parent.save();
    }

    await this.updateParentSubtaskCount(parentId);

    if (parent.parentTask) {
      await this.checkParentAutoComplete(parent.parentTask);
    }
  }

  async deleteTask(taskId, userId = 'default') {
    const task = await Task.findOne({ _id: taskId, userId });
    if (!task) {
      throw new Error('Task not found');
    }

    const parentId = task.parentTask;

    await this.deleteAllSubtasks(taskId);
    await Task.findByIdAndDelete(taskId);

    if (parentId) {
      await this.updateParentSubtaskCount(parentId);
      await this.checkParentAutoComplete(parentId);
    }

    return { success: true, message: 'Task deleted successfully' };
  }

  async deleteAllSubtasks(parentId) {
    const subtasks = await Task.find({ parentTask: parentId });
    for (const subtask of subtasks) {
      await this.deleteAllSubtasks(subtask._id);
      await Task.findByIdAndDelete(subtask._id);
    }
  }

  async moveTask(taskId, prevTaskId, nextTaskId, userId = 'default') {
    const task = await Task.findOne({ _id: taskId, userId });
    if (!task) {
      throw new Error('Task not found');
    }

    let prevRank = null;
    let nextRank = null;
    let targetParent = null;

    if (prevTaskId) {
      const prevTask = await Task.findOne({ _id: prevTaskId, userId });
      if (!prevTask) throw new Error('Previous task not found');
      prevRank = prevTask.sortRank;
      targetParent = prevTask.parentTask;
    }

    if (nextTaskId) {
      const nextTask = await Task.findOne({ _id: nextTaskId, userId });
      if (!nextTask) throw new Error('Next task not found');
      nextRank = nextTask.sortRank;
      targetParent = nextTask.parentTask;
    }

    if (prevTaskId && nextTaskId) {
      const prevTask = await Task.findById(prevTaskId);
      const nextTask = await Task.findById(nextTaskId);
      if (prevTask.parentTask?.toString() !== nextTask.parentTask?.toString()) {
        throw new Error('Previous and next tasks must be in the same parent');
      }
    }

    if (task.parentTask?.toString() !== targetParent?.toString()) {
      if (targetParent) {
        await this.checkCircularReference(taskId, targetParent);
      }
      const oldParent = task.parentTask;
      task.parentTask = targetParent;
      
      if (oldParent) {
        await this.updateParentSubtaskCount(oldParent);
        await this.checkParentAutoComplete(oldParent);
      }
    }

    try {
      task.sortRank = rankBetween(prevRank, nextRank);
    } catch (e) {
      const siblings = await Task.find({ parentTask: targetParent })
        .sort({ sortRank: 1 })
        .select('_id sortRank');
      
      const ranks = siblings.map(s => s.sortRank);
      const newRanks = rebalanceRanks(ranks);
      
      for (let i = 0; i < siblings.length; i++) {
        await Task.findByIdAndUpdate(siblings[i]._id, { sortRank: newRanks[i] });
      }
      
      const taskIndex = siblings.findIndex(s => s._id.toString() === taskId.toString());
      if (taskIndex >= 0) {
        task.sortRank = newRanks[taskIndex];
      } else {
        if (!prevRank) {
          task.sortRank = rankBetween(null, newRanks[0]);
        } else if (!nextRank) {
          task.sortRank = rankBetween(newRanks[newRanks.length - 1], null);
        }
      }
    }

    await task.save();

    if (task.parentTask) {
      await this.updateParentSubtaskCount(task.parentTask);
      await this.checkParentAutoComplete(task.parentTask);
    }

    return await this.getTaskWithSubtasks(task._id, userId);
  }

  async getAllTags(userId = 'default') {
    const result = await Task.aggregate([
      { $match: { userId } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    
    return result.map(item => ({ tag: item._id, count: item.count }));
  }
}

module.exports = new TaskService();
