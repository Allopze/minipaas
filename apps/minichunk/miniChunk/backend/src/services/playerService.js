import fs from 'fs';
import path from 'path';
import { db } from '../database/init.js';
import { sendCommand, getServerProcess } from './serverManager.js';

// Read JSON file from server folder
function readJsonFile(serverPath, fileName) {
  const filePath = path.join(serverPath, fileName);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// Write JSON file to server folder
function writeJsonFile(serverPath, fileName, data) {
  const filePath = path.join(serverPath, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Whitelist management
export function getWhitelist(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  return readJsonFile(server.folderPath, 'whitelist.json');
}

export function addToWhitelist(serverId, playerName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  const whitelist = readJsonFile(server.folderPath, 'whitelist.json');
  
  // Check if already exists
  if (whitelist.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    throw new Error('Player already in whitelist');
  }
  
  // Add player (UUID will be fetched by server on reload)
  whitelist.push({ name: playerName, uuid: '' });
  writeJsonFile(server.folderPath, 'whitelist.json', whitelist);
  
  // Reload whitelist if server is running
  if (getServerProcess(serverId)) {
    sendCommand(serverId, 'whitelist reload');
  }
  
  return { success: true };
}

export function removeFromWhitelist(serverId, playerName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  let whitelist = readJsonFile(server.folderPath, 'whitelist.json');
  whitelist = whitelist.filter(p => p.name.toLowerCase() !== playerName.toLowerCase());
  writeJsonFile(server.folderPath, 'whitelist.json', whitelist);
  
  if (getServerProcess(serverId)) {
    sendCommand(serverId, 'whitelist reload');
  }
  
  return { success: true };
}

// OPs management
export function getOps(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  return readJsonFile(server.folderPath, 'ops.json');
}

export function addOp(serverId, playerName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  // If server is running, use command
  if (getServerProcess(serverId)) {
    sendCommand(serverId, `op ${playerName}`);
    return { success: true };
  }
  
  // Otherwise modify file directly
  const ops = readJsonFile(server.folderPath, 'ops.json');
  if (ops.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    throw new Error('Player is already an operator');
  }
  
  ops.push({
    name: playerName,
    uuid: '',
    level: 4,
    bypassesPlayerLimit: false
  });
  writeJsonFile(server.folderPath, 'ops.json', ops);
  
  return { success: true };
}

export function removeOp(serverId, playerName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  if (getServerProcess(serverId)) {
    sendCommand(serverId, `deop ${playerName}`);
    return { success: true };
  }
  
  let ops = readJsonFile(server.folderPath, 'ops.json');
  ops = ops.filter(p => p.name.toLowerCase() !== playerName.toLowerCase());
  writeJsonFile(server.folderPath, 'ops.json', ops);
  
  return { success: true };
}

// Bans management
export function getBannedPlayers(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  return readJsonFile(server.folderPath, 'banned-players.json');
}

export function banPlayer(serverId, playerName, reason = 'Banned by panel') {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  if (getServerProcess(serverId)) {
    sendCommand(serverId, `ban ${playerName} ${reason}`);
    return { success: true };
  }
  
  const bans = readJsonFile(server.folderPath, 'banned-players.json');
  if (bans.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    throw new Error('Player is already banned');
  }
  
  bans.push({
    name: playerName,
    uuid: '',
    created: new Date().toISOString(),
    source: 'MiniChunk',
    expires: 'forever',
    reason
  });
  writeJsonFile(server.folderPath, 'banned-players.json', bans);
  
  return { success: true };
}

export function unbanPlayer(serverId, playerName) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');
  
  if (getServerProcess(serverId)) {
    sendCommand(serverId, `pardon ${playerName}`);
    return { success: true };
  }
  
  let bans = readJsonFile(server.folderPath, 'banned-players.json');
  bans = bans.filter(p => p.name.toLowerCase() !== playerName.toLowerCase());
  writeJsonFile(server.folderPath, 'banned-players.json', bans);
  
  return { success: true };
}
