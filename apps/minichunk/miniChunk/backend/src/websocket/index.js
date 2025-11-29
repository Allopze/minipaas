import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import { JWT_SECRET } from '../middleware/auth.js';

// Store WebSocket connections by server ID
const serverConnections = new Map();
let wss = null;

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const MAX_MESSAGES_PER_WINDOW = 10;
const messageRateLimits = new Map(); // Map<ws, {count, timestamp}>

function isRateLimited(ws) {
  const now = Date.now();
  const clientLimit = messageRateLimits.get(ws);
  
  if (!clientLimit || (now - clientLimit.timestamp) >= RATE_LIMIT_WINDOW_MS) {
    // New window
    messageRateLimits.set(ws, { count: 1, timestamp: now });
    return false;
  }
  
  if (clientLimit.count >= MAX_MESSAGES_PER_WINDOW) {
    return true;
  }
  
  clientLimit.count++;
  return false;
}

// Close all WebSocket connections
export function closeAllConnections() {
  if (wss) {
    wss.clients.forEach((client) => {
      client.close(1001, 'Server shutting down');
    });
  }
  serverConnections.clear();
  messageRateLimits.clear();
}

export function setupWebSocket(webSocketServer) {
  wss = webSocketServer;
  
  wss.on('connection', (ws, req) => {
    logger.debug('WebSocket connection established');
    
    let authenticated = false;
    let userId = null;
    let userRole = null;
    let subscribedServers = new Set();
    
    ws.on('message', (message) => {
      try {
        // Rate limiting check (except for auth messages)
        const data = JSON.parse(message.toString());
        
        if (data.type !== 'auth' && isRateLimited(ws)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded. Please slow down.' }));
          return;
        }
        
        // Handle authentication
        if (data.type === 'auth') {
          try {
            const decoded = jwt.verify(data.token, JWT_SECRET);
            authenticated = true;
            userId = decoded.id;
            userRole = decoded.role;
            ws.send(JSON.stringify({ type: 'auth', success: true }));
          } catch (error) {
            ws.send(JSON.stringify({ type: 'auth', success: false, error: 'Invalid token' }));
          }
          return;
        }
        
        // Require authentication for other messages
        if (!authenticated) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
          return;
        }
        
        // Subscribe to server console
        if (data.type === 'subscribe') {
          const serverId = data.serverId;
          subscribedServers.add(serverId);
          
          if (!serverConnections.has(serverId)) {
            serverConnections.set(serverId, new Set());
          }
          serverConnections.get(serverId).add(ws);
          
          ws.send(JSON.stringify({ type: 'subscribed', serverId }));
        }
        
        // Unsubscribe from server console
        if (data.type === 'unsubscribe') {
          const serverId = data.serverId;
          subscribedServers.delete(serverId);
          
          if (serverConnections.has(serverId)) {
            serverConnections.get(serverId).delete(ws);
          }
        }
        
        // Send command to server
        if (data.type === 'command') {
          const { serverId, command } = data;
          
          // Import dynamically to avoid circular dependency
          import('../services/serverManager.js').then(({ sendCommand }) => {
            try {
              sendCommand(serverId, command);
              ws.send(JSON.stringify({ type: 'command_sent', serverId, command }));
            } catch (error) {
              ws.send(JSON.stringify({ type: 'error', message: error.message }));
            }
          });
        }
        
      } catch (error) {
        logger.error({ error: error.message }, 'WebSocket message error');
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
    
    ws.on('close', () => {
      // Cleanup subscriptions and rate limits
      for (const serverId of subscribedServers) {
        if (serverConnections.has(serverId)) {
          serverConnections.get(serverId).delete(ws);
        }
      }
      messageRateLimits.delete(ws);
    });
    
    ws.on('error', (error) => {
      logger.error({ error: error.message }, 'WebSocket error');
    });
  });
}

// Broadcast console output to subscribers
export function broadcastServerOutput(serverId, line) {
  if (!serverConnections.has(serverId)) return;
  
  const message = JSON.stringify({
    type: 'console',
    serverId,
    line,
    timestamp: new Date().toISOString()
  });
  
  for (const ws of serverConnections.get(serverId)) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(message);
    }
  }
}

// Broadcast server status change
export function broadcastServerStatus(serverId, status) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: 'status',
    serverId,
    status,
    timestamp: new Date().toISOString()
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}
