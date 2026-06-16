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
      const { remindAt } = req.body;
      const task = await ReminderService.setReminder(id, remindAt, userId);
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
      const logs = await ReminderService.getReminderHistory(id, userId);
      res.json(logs);
    } catch (error) {
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
