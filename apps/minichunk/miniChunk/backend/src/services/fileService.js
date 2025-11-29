import fs from 'fs';
import path from 'path';
import { db } from '../database/init.js';

const ALLOWED_EXTENSIONS = [
  '.properties', '.json', '.yml', '.yaml', '.txt', '.cfg', '.conf', '.toml', '.ini'
];

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// List directory contents
export function listDirectory(serverId, relativePath = '') {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  // Sanitize and resolve path
  const basePath = path.resolve(server.folderPath);
  const targetPath = path.resolve(basePath, relativePath);
  
  // Prevent path traversal
  if (!targetPath.startsWith(basePath)) {
    throw new Error('Invalid path');
  }
  
  if (!fs.existsSync(targetPath)) {
    throw new Error('Directory not found');
  }
  
  const stats = fs.statSync(targetPath);
  if (!stats.isDirectory()) {
    throw new Error('Path is not a directory');
  }
  
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  const items = [];
  
  for (const entry of entries) {
    const itemPath = path.join(targetPath, entry.name);
    const itemStats = fs.statSync(itemPath);
    
    items.push({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: entry.isFile() ? itemStats.size : null,
      modifiedAt: itemStats.mtime.toISOString(),
      editable: entry.isFile() && isEditable(entry.name)
    });
  }
  
  // Sort: directories first, then files, both alphabetically
  items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  
  return {
    path: relativePath || '/',
    items
  };
}

// Check if file is editable
function isEditable(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

// Read file content
export function readFile(serverId, relativePath) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  const basePath = path.resolve(server.folderPath);
  const targetPath = path.resolve(basePath, relativePath);
  
  if (!targetPath.startsWith(basePath)) {
    throw new Error('Invalid path');
  }
  
  if (!fs.existsSync(targetPath)) {
    throw new Error('File not found');
  }
  
  const stats = fs.statSync(targetPath);
  if (stats.isDirectory()) {
    throw new Error('Path is a directory');
  }
  
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error('File too large to edit');
  }
  
  const content = fs.readFileSync(targetPath, 'utf-8');
  
  return {
    path: relativePath,
    content,
    size: stats.size,
    editable: isEditable(path.basename(relativePath))
  };
}

// Write file content
export function writeFile(serverId, relativePath, content) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  const basePath = path.resolve(server.folderPath);
  const targetPath = path.resolve(basePath, relativePath);
  
  if (!targetPath.startsWith(basePath)) {
    throw new Error('Invalid path');
  }
  
  if (!isEditable(path.basename(relativePath))) {
    throw new Error('File type not allowed for editing');
  }
  
  fs.writeFileSync(targetPath, content, 'utf-8');
  
  return { success: true, message: 'File saved' };
}

// Get file path for download
export function getFilePath(serverId, relativePath) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  const basePath = path.resolve(server.folderPath);
  const targetPath = path.resolve(basePath, relativePath);
  
  if (!targetPath.startsWith(basePath)) {
    throw new Error('Invalid path');
  }
  
  return targetPath;
}
