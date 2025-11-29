import fs from 'fs';
import path from 'path';
import { db } from '../database/init.js';

export function getServerLogs(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) {
    throw new Error('Server not found');
  }

  const logsDir = path.join(server.folderPath, 'logs');
  if (!fs.existsSync(logsDir)) {
    return [];
  }

  const files = fs.readdirSync(logsDir);
  const logs = [];

  for (const file of files) {
    if (file.endsWith('.log') || file.endsWith('.log.gz')) {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      logs.push({
        name: file,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString()
      });
    }
  }

  // Sort by modified date, latest first
  logs.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  
  return logs;
}

export function getLogContent(serverId, logName, offset = 0, limit = 500) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) {
    throw new Error('Server not found');
  }

  // Sanitize logName to prevent path traversal
  const sanitizedName = path.basename(logName);
  const logPath = path.join(server.folderPath, 'logs', sanitizedName);

  if (!fs.existsSync(logPath)) {
    throw new Error('Log file not found');
  }

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');
  
  return {
    totalLines: lines.length,
    lines: lines.slice(offset, offset + limit),
    hasMore: offset + limit < lines.length
  };
}

export function getLogPath(serverId, logName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) {
    throw new Error('Server not found');
  }

  const sanitizedName = path.basename(logName);
  return path.join(server.folderPath, 'logs', sanitizedName);
}
