const express = require('express');
const TaskController = require('../controllers/taskController');

const router = express.Router();

router.post('/', TaskController.createTask);
router.get('/', TaskController.getTasks);
router.get('/stats', TaskController.getStats);
router.get('/tags', TaskController.getTags);
router.get('/overdue', TaskController.getOverdueTasks);
router.get('/today', TaskController.getTodayTasks);
router.post('/recurrence/preview', TaskController.getRecurrencePreview);
router.post('/batch/update', TaskController.batchUpdate);
router.post('/batch/add-tags', TaskController.batchAddTags);
router.post('/batch/remove-tags', TaskController.batchRemoveTags);
router.post('/batch/delete', TaskController.batchDelete);
router.get('/:id', TaskController.getTask);
router.put('/:id', TaskController.updateTask);
router.delete('/:id', TaskController.deleteTask);
router.post('/:id/move', TaskController.moveTask);
router.post('/:id/complete', TaskController.completeTask);
router.post('/:id/reminder', TaskController.setReminder);
router.delete('/:id/reminder', TaskController.clearReminder);
router.get('/:id/reminders', TaskController.getReminderHistory);

module.exports = router;
