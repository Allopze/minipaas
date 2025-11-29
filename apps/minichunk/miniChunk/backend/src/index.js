import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import logger from './utils/logger.js';
import { initDatabase, getDb } from './database/init.js';
import { authRoutes } from './routes/auth.js';
import { serverRoutes } from './routes/servers.js';
import { templateRoutes } from './routes/templates.js';
import { userRoutes } from './routes/users.js';
import { metricsRoutes } from './routes/metrics.js';
import { setupWebSocket, closeAllConnections } from './websocket/index.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { autoStartServers, getRunningServers, stopServer } from './services/serverManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:6200', 'http://localhost:5173'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn({ origin }, 'CORS blocked request from unauthorized origin');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // maximum 100 requests per window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // maximum 5 login attempts
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for backups download
app.use('/backups', express.static(path.join(__dirname, '../data/backups')));

// Serve frontend static build if exists (production)
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // Return index.html for any route that doesn't match the API
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/users', userRoutes);
app.use('/api/metrics', metricsRoutes);

// Health check with detailed status
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'unknown',
    memory: process.memoryUsage()
  };
  
  try {
    // Verify DB connection
    const db = getDb();
    db.prepare('SELECT 1').get();
    health.database = 'connected';
  } catch (e) {
    health.database = 'error';
    health.status = 'degraded';
    logger.error({ error: e.message }, 'Health check: database error');
  }
  
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// Global error handler - catches all unhandled errors
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  
  // Don't expose error details in production
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(err.status || 500).json({ 
    error: errorMessage,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// WebSocket setup
setupWebSocket(wss);

// Initialize
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Initialize database
    await initDatabase();
    logger.info('Database initialized');

    // Start scheduler for automated tasks
    startScheduler();
    logger.info('Scheduler started');

    // Auto-start servers with autoStart flag
    await autoStartServers();
    logger.info('Auto-start check completed');

    server.listen(PORT, () => {
      logger.info({ port: PORT }, 'MiniChunk Backend running');
    });
  } catch (error) {
    logger.fatal({ error: error.message }, 'Failed to start server');
    process.exit(1);
  }
}

start();

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown...');
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Stop scheduler
  stopScheduler();
  logger.info('Scheduler stopped');
  
  // Stop all running Minecraft servers
  const runningServers = getRunningServers();
  logger.info({ count: runningServers.size }, 'Stopping running Minecraft servers...');
  
  for (const [serverId] of runningServers) {
    try {
      logger.info({ serverId }, 'Stopping server...');
      await stopServer(serverId);
      logger.info({ serverId }, 'Server stopped');
    } catch (e) {
      logger.error({ serverId, error: e.message }, 'Error stopping server during shutdown');
    }
  }
  
  // Close WebSocket connections
  closeAllConnections();
  logger.info('WebSocket connections closed');
  
  // Give time for cleanup
  setTimeout(() => {
    logger.info('Graceful shutdown completed');
    process.exit(0);
  }, 1000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
