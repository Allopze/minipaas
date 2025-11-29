import fs from 'fs';
import path from 'path';
import { db } from '../database/init.js';

// Read server.properties file
function readServerProperties(serverPath) {
  const propsPath = path.join(serverPath, 'server.properties');
  if (!fs.existsSync(propsPath)) {
    return {};
  }
  
  const content = fs.readFileSync(propsPath, 'utf-8');
  const props = {};
  
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        props[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  
  return props;
}

// Write server.properties file
function writeServerProperties(serverPath, props) {
  const propsPath = path.join(serverPath, 'server.properties');
  let content = '#Minecraft server properties\n';
  content += `#${new Date().toString()}\n`;
  
  for (const [key, value] of Object.entries(props)) {
    content += `${key}=${value}\n`;
  }
  
  fs.writeFileSync(propsPath, content);
}

// Get current world
export function getCurrentWorld(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  const props = readServerProperties(server.folderPath);
  return props['level-name'] || 'world';
}

// List available worlds
export function listWorlds(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  const currentWorld = getCurrentWorld(serverId);
  const worlds = [];
  
  const entries = fs.readdirSync(server.folderPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Check if it's a world folder (has level.dat)
      const levelDatPath = path.join(server.folderPath, entry.name, 'level.dat');
      if (fs.existsSync(levelDatPath)) {
        const stats = fs.statSync(levelDatPath);
        worlds.push({
          name: entry.name,
          isCurrent: entry.name === currentWorld,
          lastModified: stats.mtime.toISOString()
        });
      }
    }
  }
  
  return worlds;
}

// Change current world
export function setCurrentWorld(serverId, worldName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  // Verify world exists
  const worldPath = path.join(server.folderPath, worldName, 'level.dat');
  if (!fs.existsSync(worldPath)) {
    throw new Error('World not found');
  }
  
  const props = readServerProperties(server.folderPath);
  props['level-name'] = worldName;
  writeServerProperties(server.folderPath, props);
  
  return { success: true, message: 'World changed. Restart server to apply.' };
}

// Create new world
export function createWorld(serverId, worldName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  // Sanitize world name
  const sanitizedName = worldName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const worldPath = path.join(server.folderPath, sanitizedName);
  
  if (fs.existsSync(worldPath)) {
    throw new Error('World folder already exists');
  }
  
  // Create empty world folder (server will generate it on startup)
  fs.mkdirSync(worldPath);
  
  // Update server.properties
  const props = readServerProperties(server.folderPath);
  props['level-name'] = sanitizedName;
  writeServerProperties(server.folderPath, props);
  
  return { 
    success: true, 
    message: 'World created. Restart server to generate it.',
    worldName: sanitizedName
  };
}

// Delete world
export function deleteWorld(serverId, worldName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  const currentWorld = getCurrentWorld(serverId);
  if (worldName === currentWorld) {
    throw new Error('Cannot delete current world');
  }
  
  const worldPath = path.join(server.folderPath, worldName);
  if (!fs.existsSync(worldPath)) {
    throw new Error('World not found');
  }
  
  fs.rmSync(worldPath, { recursive: true });
  
  return { success: true };
}
