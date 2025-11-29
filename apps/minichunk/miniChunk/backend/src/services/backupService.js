import archiver from 'archiver';
import extractZip from 'extract-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupsDir = path.join(__dirname, '../../data/backups');

export async function createBackup(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) {
    throw new Error('Server not found');
  }

  if (!fs.existsSync(server.folderPath)) {
    throw new Error('Server folder not found');
  }

  // Create server backup directory
  const serverBackupDir = path.join(backupsDir, serverId);
  if (!fs.existsSync(serverBackupDir)) {
    fs.mkdirSync(serverBackupDir, { recursive: true });
  }

  const backupId = uuidv4();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${timestamp}.zip`;
  const filePath = path.join(serverBackupDir, fileName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const stats = fs.statSync(filePath);
      
      // Save to database
      db.prepare(`
        INSERT INTO backups (id, serverId, fileName, size)
        VALUES (?, ?, ?, ?)
      `).run(backupId, serverId, fileName, stats.size);

      resolve({
        id: backupId,
        fileName,
        size: stats.size,
        createdAt: new Date().toISOString()
      });
    });

    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(server.folderPath, false);
    archive.finalize();
  });
}

export function listBackups(serverId) {
  return db.prepare(`
    SELECT * FROM backups WHERE serverId = ? ORDER BY createdAt DESC
  `).all(serverId);
}

export function getBackup(backupId) {
  return db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId);
}

export function getBackupPath(backup) {
  return path.join(backupsDir, backup.serverId, backup.fileName);
}

export async function restoreBackup(backupId) {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId);
  if (!backup) {
    throw new Error('Backup not found');
  }

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(backup.serverId);
  if (!server) {
    throw new Error('Server not found');
  }

  const backupPath = path.join(backupsDir, backup.serverId, backup.fileName);
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found');
  }

  // Create a temporary backup of current state
  const tempBackupDir = path.join(backupsDir, 'temp', backup.serverId);
  if (fs.existsSync(tempBackupDir)) {
    fs.rmSync(tempBackupDir, { recursive: true });
  }
  fs.mkdirSync(tempBackupDir, { recursive: true });

  // Move current files to temp
  if (fs.existsSync(server.folderPath)) {
    const files = fs.readdirSync(server.folderPath);
    for (const file of files) {
      const src = path.join(server.folderPath, file);
      const dest = path.join(tempBackupDir, file);
      fs.renameSync(src, dest);
    }
  }

  try {
    // Extract backup
    await extractZip(backupPath, { dir: server.folderPath });
    
    // Cleanup temp
    fs.rmSync(tempBackupDir, { recursive: true });
    
    return { success: true, message: 'Backup restored successfully' };
  } catch (error) {
    // Restore from temp on failure
    const tempFiles = fs.readdirSync(tempBackupDir);
    for (const file of tempFiles) {
      const src = path.join(tempBackupDir, file);
      const dest = path.join(server.folderPath, file);
      fs.renameSync(src, dest);
    }
    fs.rmSync(tempBackupDir, { recursive: true });
    throw error;
  }
}

export function deleteBackup(backupId) {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId);
  if (!backup) {
    throw new Error('Backup not found');
  }

  const backupPath = path.join(backupsDir, backup.serverId, backup.fileName);
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  db.prepare('DELETE FROM backups WHERE id = ?').run(backupId);
  return { success: true, message: 'Backup deleted' };
}
