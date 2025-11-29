import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/init.js';
import { restartServer } from './serverManager.js';
import { createBackup } from './backupService.js';
import logger from '../utils/logger.js';

let schedulerInterval = null;

export function startScheduler() {
  // Check every minute
  schedulerInterval = setInterval(checkScheduledTasks, 60000);
  logger.info('Scheduler started - checking tasks every minute');
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

async function checkScheduledTasks() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  const tasks = db.prepare(`
    SELECT * FROM scheduled_tasks WHERE enabled = 1
  `).all();
  
  for (const task of tasks) {
    if (task.hour === currentHour && task.minute === currentMinute) {
      // Check if task already ran this minute
      if (task.lastRun) {
        const lastRun = new Date(task.lastRun);
        const diffMinutes = (now - lastRun) / 60000;
        if (diffMinutes < 1) {
          continue; // Already ran this minute
        }
      }
      
      logger.info({ taskType: task.taskType, serverId: task.serverId }, 'Executing scheduled task');
      
      try {
        if (task.taskType === 'restart') {
          await restartServer(task.serverId);
        } else if (task.taskType === 'backup') {
          await createBackup(task.serverId);
        }
        
        // Update lastRun
        db.prepare(`
          UPDATE scheduled_tasks SET lastRun = ? WHERE id = ?
        `).run(now.toISOString(), task.id);
        
        logger.info({ taskType: task.taskType, serverId: task.serverId }, 'Scheduled task completed');
      } catch (error) {
        logger.error({ taskType: task.taskType, serverId: task.serverId, error: error.message }, 'Scheduled task failed');
      }
    }
  }
}

// Get scheduled tasks for a server
export function getScheduledTasks(serverId) {
  return db.prepare(`
    SELECT * FROM scheduled_tasks WHERE serverId = ?
  `).all(serverId);
}

// Update or create scheduled task
export function setScheduledTask(serverId, taskType, enabled, hour, minute) {
  const existing = db.prepare(`
    SELECT * FROM scheduled_tasks WHERE serverId = ? AND taskType = ?
  `).get(serverId, taskType);
  
  if (existing) {
    db.prepare(`
      UPDATE scheduled_tasks SET enabled = ?, hour = ?, minute = ? WHERE id = ?
    `).run(enabled ? 1 : 0, hour, minute, existing.id);
  } else {
    db.prepare(`
      INSERT INTO scheduled_tasks (id, serverId, taskType, enabled, hour, minute)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), serverId, taskType, enabled ? 1 : 0, hour, minute);
  }
  
  return { success: true };
}
