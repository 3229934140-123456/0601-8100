const cron = require('node-cron');
const ReminderService = require('../services/reminderService');
const RecurrenceService = require('../services/recurrenceService');

class Scheduler {
  constructor() {
    this.jobs = {};
  }

  start() {
    console.log('⏰ Starting scheduler...');

    this.jobs.reminderChecker = cron.schedule('*/5 * * * *', async () => {
      console.log('[Scheduler] Checking for due reminders...');
      try {
        const results = await ReminderService.processDueReminders();
        if (results.length > 0) {
          console.log(`[Scheduler] Sent ${results.length} reminder(s)`);
        }
      } catch (error) {
        console.error('[Scheduler] Error processing reminders:', error);
      }
    });

    this.jobs.recurrenceGenerator = cron.schedule('0 * * * *', async () => {
      console.log('[Scheduler] Checking for recurring tasks...');
      try {
        const generatedTasks = await RecurrenceService.processCompletedTasks();
        if (generatedTasks.length > 0) {
          console.log(`[Scheduler] Generated ${generatedTasks.length} recurring task(s)`);
        }
      } catch (error) {
        console.error('[Scheduler] Error generating recurring tasks:', error);
      }
    });

    this.jobs.dailySummary = cron.schedule('0 8 * * *', async () => {
      console.log('[Scheduler] Daily summary...');
      try {
        const ReminderService = require('../services/reminderService');
        const todayTasks = await ReminderService.getTasksDueToday('default');
        const overdueTasks = await ReminderService.getOverdueTasks('default');
        console.log(`[Scheduler] Daily summary: ${todayTasks.length} tasks due today, ${overdueTasks.length} overdue`);
      } catch (error) {
        console.error('[Scheduler] Error generating daily summary:', error);
      }
    });

    console.log('✅ Scheduler started successfully');
  }

  stop() {
    Object.values(this.jobs).forEach(job => {
      if (job && job.stop) {
        job.stop();
      }
    });
    console.log('⏹️  Scheduler stopped');
  }
}

module.exports = new Scheduler();
