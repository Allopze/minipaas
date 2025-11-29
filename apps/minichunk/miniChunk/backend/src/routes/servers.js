import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import extractZip from 'extract-zip';
import { db } from '../database/init.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { 
  startServer, 
  stopServer, 
  restartServer, 
  getServerStatus,
  sendCommand,
  getServerProcess
} from '../services/serverManager.js';
import { 
  createBackup, 
  listBackups, 
  getBackup, 
  getBackupPath, 
  restoreBackup,
  deleteBackup 
} from '../services/backupService.js';
import { getServerLogs, getLogContent, getLogPath } from '../services/logService.js';
import {
  getWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  getOps,
  addOp,
  removeOp,
  getBannedPlayers,
  banPlayer,
  unbanPlayer
} from '../services/playerService.js';
import {
  getCurrentWorld,
  listWorlds,
  setCurrentWorld,
  createWorld,
  deleteWorld
} from '../services/worldService.js';
import {
  listDirectory,
  readFile,
  writeFile,
  getFilePath
} from '../services/fileService.js';
import { getScheduledTasks, setScheduledTask } from '../services/scheduler.js';
import { 
  downloadServerJar, 
  getDefaultJarName, 
  getDefaultJvmArgs 
} from '../services/jarDownloadService.js';

export const serverRoutes = Router();

// Base path for all servers
const SERVERS_BASE_PATH = path.join(process.cwd(), 'data', 'servers');
if (!fs.existsSync(SERVERS_BASE_PATH)) {
  fs.mkdirSync(SERVERS_BASE_PATH, { recursive: true });
}

// Helper to sanitize folder names
function sanitizeFolderName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Multer config for JAR upload with size limits
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'data', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// File filter to only allow JAR and ZIP files
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['application/java-archive', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream'];
  const allowedExts = ['.jar', '.zip'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JAR and ZIP files are allowed'), false);
  }
};

const upload = multer({ 
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max for JARs and world ZIPs
    files: 1 // Only one file at a time
  },
  fileFilter
});

// ============ SERVER CRUD ============

// List all servers
serverRoutes.get('/', authMiddleware, (req, res) => {
  const servers = db.prepare('SELECT * FROM servers ORDER BY name').all();
  
  // Add runtime status
  const serversWithStatus = servers.map(server => ({
    ...server,
    autoStart: !!server.autoStart,
    ...getServerStatus(server.id)
  }));
  
  res.json(serversWithStatus);
});

// Get single server
serverRoutes.get('/:id', authMiddleware, (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  res.json({
    ...server,
    autoStart: !!server.autoStart,
    ...getServerStatus(server.id)
  });
});

// Create server
serverRoutes.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, jarPath, version, port, memoryMb, autoStart, templateId, jvmArgs, serverType, downloadJar } = req.body;
    
    // Validation
    if (!name || !port) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check port uniqueness
    const existingPort = db.prepare('SELECT id FROM servers WHERE port = ?').get(port);
    if (existingPort) {
      return res.status(400).json({ error: 'Port already in use' });
    }
    
    // Generate folder path from server name
    const folderName = sanitizeFolderName(name);
    const folderPath = path.join(SERVERS_BASE_PATH, folderName);
    
    // Check if folder already exists
    if (fs.existsSync(folderPath)) {
      return res.status(400).json({ error: 'A server with this name already exists' });
    }
    
    // Create folder
    fs.mkdirSync(folderPath, { recursive: true });
    
    // Validate memory
    const memory = memoryMb || 2048;
    if (memory < 512 || memory > 32768) {
      return res.status(400).json({ error: 'Memory must be between 512MB and 32GB' });
    }
    
    // Determine jar file name
    let finalJarPath = jarPath;
    let finalJvmArgs = jvmArgs;
    
    // Download JAR if serverType and version provided
    if (downloadJar && serverType && version) {
      try {
        logger.info({ serverType, version }, 'Downloading JAR...');
        await downloadServerJar(serverType, version, folderPath);
        finalJarPath = getDefaultJarName(serverType);
        finalJvmArgs = finalJvmArgs || getDefaultJvmArgs(serverType);
        logger.info({ jarPath: finalJarPath }, 'JAR downloaded successfully');
      } catch (downloadError) {
        logger.error({ error: downloadError.message }, 'JAR download error');
        // Clean up folder on error
        fs.rmSync(folderPath, { recursive: true, force: true });
        return res.status(400).json({ error: `Failed to download JAR: ${downloadError.message}` });
      }
    } else if (!jarPath) {
      return res.status(400).json({ error: 'JAR path is required when not downloading automatically' });
    }
    
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO servers (id, name, folderPath, jarPath, version, port, memoryMb, autoStart, templateId, jvmArgs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, folderPath, finalJarPath, version || '', port, memory, autoStart ? 1 : 0, serverType || templateId || null, finalJvmArgs || '');
    
    res.status(201).json({
      id,
      name,
      folderPath,
      jarPath: finalJarPath,
      version,
      port,
      memoryMb: memory,
      autoStart: !!autoStart,
      templateId: serverType || templateId,
      jvmArgs: finalJvmArgs,
      serverType
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Create server error');
    res.status(500).json({ error: 'Failed to create server' });
  }
});

// Update server
serverRoutes.put('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const { id } = req.params;
    const { name, folderPath, jarPath, version, port, memoryMb, autoStart, jvmArgs } = req.body;
    
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    
    // Check port uniqueness if changed
    if (port && port !== server.port) {
      const existingPort = db.prepare('SELECT id FROM servers WHERE port = ? AND id != ?').get(port, id);
      if (existingPort) {
        return res.status(400).json({ error: 'Port already in use' });
      }
    }
    
    db.prepare(`
      UPDATE servers SET 
        name = ?, folderPath = ?, jarPath = ?, version = ?, 
        port = ?, memoryMb = ?, autoStart = ?, jvmArgs = ?
      WHERE id = ?
    `).run(
      name || server.name,
      folderPath || server.folderPath,
      jarPath || server.jarPath,
      version !== undefined ? version : server.version,
      port || server.port,
      memoryMb || server.memoryMb,
      autoStart !== undefined ? (autoStart ? 1 : 0) : server.autoStart,
      jvmArgs !== undefined ? jvmArgs : server.jvmArgs,
      id
    );
    
    res.json({ message: 'Server updated' });
  } catch (error) {
    logger.error({ error: error.message, serverId: id }, 'Update server error');
    res.status(500).json({ error: 'Failed to update server' });
  }
});

// Delete server
serverRoutes.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Stop server if running
    if (getServerProcess(id)) {
      await stopServer(id);
    }
    
    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    res.json({ message: 'Server deleted' });
  } catch (error) {
    logger.error({ error: error.message, serverId: id }, 'Delete server error');
    res.status(500).json({ error: 'Failed to delete server' });
  }
});

// ============ SERVER CONTROL ============

// Start server
serverRoutes.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const result = await startServer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Stop server
serverRoutes.post('/:id/stop', authMiddleware, async (req, res) => {
  try {
    const result = await stopServer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Restart server
serverRoutes.post('/:id/restart', authMiddleware, async (req, res) => {
  try {
    const result = await restartServer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Send command
serverRoutes.post('/:id/command', authMiddleware, (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command required' });
    }
    const result = sendCommand(req.params.id, command);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ LOGS ============

// List logs
serverRoutes.get('/:id/logs', authMiddleware, (req, res) => {
  try {
    const logs = getServerLogs(req.params.id);
    res.json(logs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get log content
serverRoutes.get('/:id/logs/:logName', authMiddleware, (req, res) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 500;
    const content = getLogContent(req.params.id, req.params.logName, offset, limit);
    res.json(content);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Download log
serverRoutes.get('/:id/logs/:logName/download', authMiddleware, (req, res) => {
  try {
    const logPath = getLogPath(req.params.id, req.params.logName);
    res.download(logPath);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ BACKUPS ============

// List backups
serverRoutes.get('/:id/backups', authMiddleware, (req, res) => {
  try {
    const backups = listBackups(req.params.id);
    res.json(backups);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create backup
serverRoutes.post('/:id/backups', authMiddleware, adminOnly, async (req, res) => {
  try {
    const backup = await createBackup(req.params.id);
    res.status(201).json(backup);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Download backup
serverRoutes.get('/:id/backups/:backupId/download', authMiddleware, (req, res) => {
  try {
    const backup = getBackup(req.params.backupId);
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    const backupPath = getBackupPath(backup);
    res.download(backupPath);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Restore backup
serverRoutes.post('/:id/backups/:backupId/restore', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Check if server is running
    if (getServerProcess(req.params.id)) {
      return res.status(400).json({ error: 'Stop the server before restoring a backup' });
    }
    
    const result = await restoreBackup(req.params.backupId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete backup
serverRoutes.delete('/:id/backups/:backupId', authMiddleware, adminOnly, (req, res) => {
  try {
    const result = deleteBackup(req.params.backupId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ PLAYERS ============

// Whitelist
serverRoutes.get('/:id/players/whitelist', authMiddleware, (req, res) => {
  try {
    const whitelist = getWhitelist(req.params.id);
    res.json(whitelist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.post('/:id/players/whitelist', authMiddleware, (req, res) => {
  try {
    const { playerName } = req.body;
    const result = addToWhitelist(req.params.id, playerName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.delete('/:id/players/whitelist/:playerName', authMiddleware, (req, res) => {
  try {
    const result = removeFromWhitelist(req.params.id, req.params.playerName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// OPs
serverRoutes.get('/:id/players/ops', authMiddleware, (req, res) => {
  try {
    const ops = getOps(req.params.id);
    res.json(ops);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.post('/:id/players/ops', authMiddleware, adminOnly, (req, res) => {
  try {
    const { playerName } = req.body;
    const result = addOp(req.params.id, playerName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.delete('/:id/players/ops/:playerName', authMiddleware, adminOnly, (req, res) => {
  try {
    const result = removeOp(req.params.id, req.params.playerName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Bans
serverRoutes.get('/:id/players/bans', authMiddleware, (req, res) => {
  try {
    const bans = getBannedPlayers(req.params.id);
    res.json(bans);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.post('/:id/players/bans', authMiddleware, adminOnly, (req, res) => {
  try {
    const { playerName, reason } = req.body;
    const result = banPlayer(req.params.id, playerName, reason);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.delete('/:id/players/bans/:playerName', authMiddleware, adminOnly, (req, res) => {
  try {
    const result = unbanPlayer(req.params.id, req.params.playerName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ WORLDS ============

serverRoutes.get('/:id/worlds', authMiddleware, (req, res) => {
  try {
    const worlds = listWorlds(req.params.id);
    res.json(worlds);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.get('/:id/worlds/current', authMiddleware, (req, res) => {
  try {
    const world = getCurrentWorld(req.params.id);
    res.json({ world });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.post('/:id/worlds/current', authMiddleware, adminOnly, (req, res) => {
  try {
    const { worldName } = req.body;
    const result = setCurrentWorld(req.params.id, worldName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.post('/:id/worlds', authMiddleware, adminOnly, (req, res) => {
  try {
    const { worldName } = req.body;
    const result = createWorld(req.params.id, worldName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Upload world from ZIP
serverRoutes.post('/:id/worlds/upload', authMiddleware, adminOnly, upload.single('world'), async (req, res) => {
  const tempFile = req.file?.path;
  let tempExtractDir = null;
  
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      throw new Error('Server not found');
    }
    
    if (!req.file) {
      throw new Error('No file uploaded');
    }
    
    const worldName = req.body.worldName || 'uploaded_world';
    
    // Validate world name
    if (!/^[a-zA-Z0-9_-]+$/.test(worldName)) {
      throw new Error('World name can only contain letters, numbers, underscores and hyphens');
    }
    
    // Create temp extraction directory
    tempExtractDir = path.join(process.cwd(), 'data', 'temp', `extract-${Date.now()}`);
    fs.mkdirSync(tempExtractDir, { recursive: true });
    
    // Extract ZIP
    logger.debug({ filename: req.file.originalname }, 'Extracting world ZIP');
    await extractZip(tempFile, { dir: tempExtractDir });
    
    // Find level.dat recursively
    function findLevelDat(dir, depth = 0) {
      if (depth > 5) return null; // Max depth to prevent infinite loops
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      // Check if level.dat exists in this directory
      if (entries.some(e => e.isFile() && e.name === 'level.dat')) {
        return dir;
      }
      
      // Search in subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const result = findLevelDat(path.join(dir, entry.name), depth + 1);
          if (result) return result;
        }
      }
      
      return null;
    }
    
    const worldSourceDir = findLevelDat(tempExtractDir);
    if (!worldSourceDir) {
      throw new Error('No valid Minecraft world found in ZIP (level.dat not found)');
    }
    
    logger.debug({ worldSourceDir }, 'Found world directory');
    
    // Destination path
    const destPath = path.join(server.folderPath, worldName);
    
    // Check if world already exists
    if (fs.existsSync(destPath)) {
      throw new Error(`World "${worldName}" already exists`);
    }
    
    // Copy world to server folder
    function copyDirRecursive(src, dest) {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPathEntry = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          copyDirRecursive(srcPath, destPathEntry);
        } else {
          fs.copyFileSync(srcPath, destPathEntry);
        }
      }
    }
    
    copyDirRecursive(worldSourceDir, destPath);
    
    logger.info({ worldName, destPath }, 'World uploaded successfully');
    
    res.json({ 
      success: true, 
      message: `World "${worldName}" uploaded successfully`,
      worldName 
    });
    
  } catch (error) {
    logger.error({ error: error.message }, 'World upload error');
    res.status(400).json({ error: error.message });
  } finally {
    // Cleanup temp files
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    if (tempExtractDir && fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }
  }
});

serverRoutes.delete('/:id/worlds/:worldName', authMiddleware, adminOnly, (req, res) => {
  try {
    const result = deleteWorld(req.params.id, req.params.worldName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ FILES ============

serverRoutes.get('/:id/files', authMiddleware, (req, res) => {
  try {
    const relativePath = req.query.path || '';
    const contents = listDirectory(req.params.id, relativePath);
    res.json(contents);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.get('/:id/files/content', authMiddleware, (req, res) => {
  try {
    const relativePath = req.query.path || '';
    const content = readFile(req.params.id, relativePath);
    res.json(content);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.put('/:id/files/content', authMiddleware, adminOnly, (req, res) => {
  try {
    const { path: relativePath, content } = req.body;
    const result = writeFile(req.params.id, relativePath, content);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.get('/:id/files/download', authMiddleware, (req, res) => {
  try {
    const relativePath = req.query.path || '';
    const filePath = getFilePath(req.params.id, relativePath);
    res.download(filePath);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ SCHEDULED TASKS ============

serverRoutes.get('/:id/tasks', authMiddleware, (req, res) => {
  try {
    const tasks = getScheduledTasks(req.params.id);
    res.json(tasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

serverRoutes.post('/:id/tasks', authMiddleware, adminOnly, (req, res) => {
  try {
    const { taskType, enabled, hour, minute } = req.body;
    
    if (!['restart', 'backup'].includes(taskType)) {
      return res.status(400).json({ error: 'Invalid task type' });
    }
    
    const result = setScheduledTask(req.params.id, taskType, enabled, hour || 0, minute || 0);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ UPDATE JAR ============

serverRoutes.post('/:id/update-jar', authMiddleware, adminOnly, upload.single('jar'), async (req, res) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    
    // Check if server is running
    if (getServerProcess(req.params.id)) {
      // Clean up uploaded file
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Stop the server before updating JAR' });
    }
    
    // Create backup first
    await createBackup(req.params.id);
    
    // Move uploaded JAR to server folder
    const destPath = path.join(server.folderPath, server.jarPath);
    fs.copyFileSync(req.file.path, destPath);
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true, message: 'JAR updated successfully. Backup created.' });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ error: error.message });
  }
});
