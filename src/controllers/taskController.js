const TaskService = require('../services/taskService');
const RecurrenceService = require('../services/recurrenceService');
const ReminderService = require('../services/reminderService');

class TaskController {
  async createTask(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const task = await TaskService.createTask(req.body, userId);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getTask(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const { depth = 3 } = req.query;
      const task = await TaskService.getTaskWithSubtasks(id, userId, parseInt(depth));
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getTasks(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const result = await TaskService.getTasks(req.query, userId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateTask(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const task = await TaskService.updateTask(id, req.body, userId);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deleteTask(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const result = await TaskService.deleteTask(id, userId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async moveTask(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const { prevTaskId, nextTaskId } = req.body;
      const task = await TaskService.moveTask(id, prevTaskId, nextTaskId, userId);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async completeTask(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const task = await TaskService.updateTask(id, { status: 'completed' }, userId);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async batchUpdate(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { taskIds, ...updateData } = req.body;
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'taskIds must be a non-empty array' });
      }
      const result = await TaskService.batchUpdate(taskIds, updateData, userId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async batchAddTags(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { taskIds, tags } = req.body;
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'taskIds must be a non-empty array' });
      }
      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        return res.status(400).json({ error: 'tags must be a non-empty array' });
      }
      const result = await TaskService.batchAddTags(taskIds, tags, userId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async batchRemoveTags(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { taskIds, tags } = req.body;
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'taskIds must be a non-empty array' });
      }
      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        return res.status(400).json({ error: 'tags must be a non-empty array' });
      }
      const result = await TaskService.batchRemoveTags(taskIds, tags, userId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async batchDelete(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { taskIds } = req.body;
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'taskIds must be a non-empty array' });
      }
      const result = await TaskService.batchDelete(taskIds, userId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getTags(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const tags = await TaskService.getAllTags(userId);
      res.json(tags);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getRecurrencePreview(req, res) {
    try {
      const { count = 5 } = req.query;
      const dates = await RecurrenceService.getRecurrencePreview(req.body, parseInt(count));
      res.json({ dates });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async setReminder(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const task = await ReminderService.setReminder(id, req.body, userId);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async clearReminder(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const task = await ReminderService.clearReminder(id, userId);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getReminderHistory(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const { recipient, recipientType, limit = 50 } = req.query;
      const logs = await ReminderService.getReminderHistory(id, userId, { recipient, recipientType, limit: parseInt(limit) });
      res.json(logs);
    } catch (error) {
      if (error.message === 'Task not found') {
        return res.status(404).json({ error: 'Task not found or no permission' });
      }
      res.status(400).json({ error: error.message });
    }
  }

  async getOverdueTasks(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const tasks = await ReminderService.getOverdueTasks(userId);
      res.json({ tasks, count: tasks.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getTodayTasks(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const tasks = await ReminderService.getTasksDueToday(userId);
      res.json({ tasks, count: tasks.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async addComment(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const author = req.headers['x-author'] || userId;
      const { id } = req.params;
      const { content } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Comment content is required' });
      }
      const comment = await TaskService.addComment(id, content.trim(), author, userId);
      res.status(201).json(comment);
    } catch (error) {
      if (error.message === 'Task not found') {
        return res.status(404).json({ error: 'Task not found or no permission' });
      }
      res.status(400).json({ error: error.message });
    }
  }

  async getComments(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const { author, mention, limit = 50 } = req.query;
      const comments = await TaskService.getComments(id, { author, mention, limit: parseInt(limit) }, userId);
      if (comments === null) {
        return res.status(404).json({ error: 'Task not found or no permission' });
      }
      res.json({ comments, count: comments.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getActivity(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      const { id } = req.params;
      const { actor, relatedTo, limit = 50 } = req.query;
      const activity = await TaskService.getRecentActivity(id, { actor, relatedTo, limit: parseInt(limit) }, userId);
      if (activity === null) {
        return res.status(404).json({ error: 'Task not found or no permission' });
      }
      res.json({ activity, count: activity.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getStats(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'default';
      
      const [total, completed, pending, overdue, today] = await Promise.all([
        TaskService.getTasks({ userId, limit: 1 }, userId).then(r => r.total),
        TaskService.getTasks({ status: 'completed', limit: 1 }, userId).then(r => r.total),
        TaskService.getTasks({ status: 'pending', limit: 1 }, userId).then(r => r.total),
        ReminderService.getOverdueTasks(userId),
        ReminderService.getTasksDueToday(userId),
      ]);

      res.json({
        total,
        completed,
        pending,
        overdue: overdue.length,
        today: today.length,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new TaskController();
