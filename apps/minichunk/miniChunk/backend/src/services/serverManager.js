import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { db } from '../database/init.js';
import { broadcastServerOutput, broadcastServerStatus } from '../websocket/index.js';
import logger from '../utils/logger.js';

// Store running server processes
const runningServers = new Map();

// Whitelist of allowed JVM argument patterns
const ALLOWED_JVM_ARG_PATTERNS = [
  /^-Xmx\d+[MGmg]$/,           // Max heap size: -Xmx4G, -Xmx2048M
  /^-Xms\d+[MGmg]$/,           // Initial heap size: -Xms2G
  /^-Xmn\d+[MGmg]$/,           // Young generation size
  /^-Xss\d+[KkMm]$/,           // Stack size
  /^-XX:\+?[A-Za-z0-9]+$/,     // Simple XX flags: -XX:+UseG1GC
  /^-XX:[A-Za-z0-9]+=\d+$/,    // XX flags with numeric values: -XX:MaxGCPauseMillis=200
  /^-D[A-Za-z0-9._-]+=?[A-Za-z0-9._/-]*$/, // System properties: -Dfile.encoding=UTF-8
  /^-jar$/,                     // JAR flag
  /^-server$/,                  // Server mode
  /^-client$/,                  // Client mode
  /^--add-opens$/,              // Module flags
  /^--add-modules$/,            // Module flags
  /^java\.base\/[a-z.]+=[A-Z]+$/,  // Module access patterns
  /^[a-zA-Z0-9._-]+$/,          // Simple alphanumeric values (for module patterns)
];

// Dangerous patterns that should never be allowed
const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>]/,           // Shell metacharacters
  /\.\.\//,                     // Path traversal
  /^-agentlib/,                 // Agent libraries can execute arbitrary code
  /^-agentpath/,                // Agent path
  /^-javaagent/,                // Java agents (except we might want these for some mods)
];

/**
 * Sanitize and validate JVM arguments to prevent command injection
 * @param {string} jvmArgsString - Space-separated JVM arguments
 * @returns {string[]} - Array of validated arguments
 */
function sanitizeJvmArgs(jvmArgsString) {
  if (!jvmArgsString || typeof jvmArgsString !== 'string') {
    return [];
  }
  
  const args = jvmArgsString.trim().split(/\s+/).filter(arg => arg.length > 0);
  const validatedArgs = [];
  
  for (const arg of args) {
    // Check for dangerous patterns first
    if (DANGEROUS_PATTERNS.some(pattern => pattern.test(arg))) {
      logger.warn({ arg }, 'Blocked dangerous JVM argument');
      continue;
    }
    
    // Check against whitelist
    if (ALLOWED_JVM_ARG_PATTERNS.some(pattern => pattern.test(arg))) {
      validatedArgs.push(arg);
    } else {
      logger.warn({ arg }, 'Blocked non-whitelisted JVM argument');
    }
  }
  
  return validatedArgs;
}

export function getRunningServers() {
  return runningServers;
}

export function getServerProcess(serverId) {
  return runningServers.get(serverId);
}

export async function startServer(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) {
    throw new Error('Server not found');
  }

  if (runningServers.has(serverId)) {
    throw new Error('Server is already running');
  }

  // Verify paths exist
  if (!fs.existsSync(server.folderPath)) {
    throw new Error(`Server folder not found: ${server.folderPath}`);
  }

  const jarFullPath = path.join(server.folderPath, server.jarPath);
  if (!fs.existsSync(jarFullPath)) {
    throw new Error(`Server JAR not found: ${jarFullPath}`);
  }

  // Accept EULA automatically if not accepted
  const eulaPath = path.join(server.folderPath, 'eula.txt');
  if (!fs.existsSync(eulaPath)) {
    fs.writeFileSync(eulaPath, 'eula=true\n');
  } else {
    let eulaContent = fs.readFileSync(eulaPath, 'utf-8');
    if (!eulaContent.includes('eula=true')) {
      eulaContent = eulaContent.replace('eula=false', 'eula=true');
      fs.writeFileSync(eulaPath, eulaContent);
    }
  }

  // Build Java arguments with sanitized jvmArgs
  const jvmArgs = sanitizeJvmArgs(server.jvmArgs);
  const args = [
    `-Xmx${server.memoryMb}M`,
    `-Xms${Math.floor(server.memoryMb / 2)}M`,
    ...jvmArgs,
    '-jar',
    server.jarPath,
    'nogui'
  ];

  logger.info({ serverName: server.name, args }, 'Starting server');

  const process = spawn('java', args, {
    cwd: server.folderPath,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const serverState = {
    process,
    output: [],
    playerCount: 0,
    status: 'starting'
  };

  runningServers.set(serverId, serverState);

  // Handle stdout
  process.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      serverState.output.push(line);
      // Keep only last 1000 lines
      if (serverState.output.length > 1000) {
        serverState.output.shift();
      }
      
      // Detect server ready
      if (line.includes('Done (') && line.includes(')!')) {
        serverState.status = 'running';
        broadcastServerStatus(serverId, 'running');
      }

      // Parse player count from list command or join/leave
      const playerMatch = line.match(/There are (\d+) of a max/);
      if (playerMatch) {
        serverState.playerCount = parseInt(playerMatch[1]);
      }

      // Player joined
      if (line.includes('joined the game')) {
        serverState.playerCount++;
      }

      // Player left
      if (line.includes('left the game')) {
        serverState.playerCount = Math.max(0, serverState.playerCount - 1);
      }

      broadcastServerOutput(serverId, line);
    });
  });

  // Handle stderr
  process.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      serverState.output.push(`[ERROR] ${line}`);
      broadcastServerOutput(serverId, `[ERROR] ${line}`);
    });
  });

  // Handle process exit
  process.on('exit', (code) => {
    logger.info({ serverName: server.name, exitCode: code }, 'Server exited');
    serverState.status = code === 0 ? 'stopped' : 'crashed';
    broadcastServerStatus(serverId, serverState.status);
    runningServers.delete(serverId);
  });

  process.on('error', (err) => {
    logger.error({ serverName: server.name, error: err.message }, 'Server process error');
    serverState.status = 'error';
    broadcastServerStatus(serverId, 'error');
    runningServers.delete(serverId);
  });

  return { success: true, message: 'Server starting' };
}

export async function stopServer(serverId) {
  const serverState = runningServers.get(serverId);
  if (!serverState) {
    throw new Error('Server is not running');
  }

  return new Promise((resolve, reject) => {
    // Send stop command
    serverState.process.stdin.write('stop\n');
    serverState.status = 'stopping';
    broadcastServerStatus(serverId, 'stopping');

    // Force kill after timeout
    const timeout = setTimeout(() => {
      if (runningServers.has(serverId)) {
        serverState.process.kill('SIGKILL');
      }
    }, 30000);

    serverState.process.on('exit', () => {
      clearTimeout(timeout);
      resolve({ success: true, message: 'Server stopped' });
    });
  });
}

export async function restartServer(serverId) {
  const serverState = runningServers.get(serverId);
  if (serverState) {
    await stopServer(serverId);
    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return startServer(serverId);
}

export function sendCommand(serverId, command) {
  const serverState = runningServers.get(serverId);
  if (!serverState) {
    throw new Error('Server is not running');
  }

  serverState.process.stdin.write(command + '\n');
  return { success: true, message: 'Command sent' };
}

export function getServerStatus(serverId) {
  const serverState = runningServers.get(serverId);
  if (!serverState) {
    return {
      status: 'stopped',
      playerCount: 0,
      output: []
    };
  }

  // Request player list periodically
  if (serverState.status === 'running') {
    serverState.process.stdin.write('list\n');
  }

  return {
    status: serverState.status,
    playerCount: serverState.playerCount,
    output: serverState.output.slice(-100)
  };
}

export async function autoStartServers() {
  const servers = db.prepare('SELECT * FROM servers WHERE autoStart = 1').all();
  for (const server of servers) {
    try {
      logger.info({ serverName: server.name }, 'Auto-starting server');
      await startServer(server.id);
    } catch (error) {
      logger.error({ serverName: server.name, error: error.message }, 'Failed to auto-start server');
    }
  }
}
