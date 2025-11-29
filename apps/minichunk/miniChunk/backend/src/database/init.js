import initSqlJs from 'sql.js';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import pino from 'pino';

// Create a minimal logger for init (can't import from logger.js due to circular deps)
const initLogger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'minichunk.db');

let _db = null;

// Save database to file
function saveDatabase() {
  if (_db) {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Wrapper to provide better-sqlite3-like API
class DatabaseWrapper {
  constructor(sqliteDb) {
    this.sqliteDb = sqliteDb;
  }

  export() {
    return this.sqliteDb.export();
  }

  exec(sql) {
    this.sqliteDb.run(sql);
    saveDatabase();
  }

  prepare(sql) {
    return new StatementWrapper(this.sqliteDb, sql);
  }

  close() {
    saveDatabase();
    this.sqliteDb.close();
  }
}

class StatementWrapper {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  run(...params) {
    this.db.run(this.sql, params);
    saveDatabase();
    return { changes: this.db.getRowsModified() };
  }

  get(...params) {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  }

  all(...params) {
    const results = [];
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
}

// Getter for db - allows access after initialization
export const db = {
  get instance() {
    return _db;
  },
  prepare(sql) {
    if (!_db) throw new Error('Database not initialized');
    return _db.prepare(sql);
  },
  exec(sql) {
    if (!_db) throw new Error('Database not initialized');
    return _db.exec(sql);
  }
};

export function getDb() {
  if (!_db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return _db;
}

export async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    _db = new DatabaseWrapper(new SQL.Database(fileBuffer));
  } else {
    _db = new DatabaseWrapper(new SQL.Database());
  }

  // Enable WAL mode for better concurrency (Note: sql.js runs in-memory, 
  // but this sets the pragma for when we export/save)
  try {
    _db.exec('PRAGMA journal_mode = WAL;');
  } catch (e) {
    // WAL mode might not be supported in sql.js, continue without it
    initLogger.debug('WAL mode not available in sql.js (expected behavior)');
  }

  // Users table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'HELPER',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Servers table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folderPath TEXT NOT NULL,
      jarPath TEXT NOT NULL,
      version TEXT,
      port INTEGER NOT NULL,
      memoryMb INTEGER DEFAULT 2048,
      autoStart INTEGER DEFAULT 0,
      templateId TEXT,
      jvmArgs TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Templates table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      version TEXT NOT NULL,
      jarUrl TEXT,
      jarFileName TEXT,
      defaultMemory INTEGER DEFAULT 2048,
      jvmArgs TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Scheduled tasks table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      serverId TEXT NOT NULL,
      taskType TEXT NOT NULL,
      enabled INTEGER DEFAULT 0,
      hour INTEGER DEFAULT 0,
      minute INTEGER DEFAULT 0,
      lastRun TEXT,
      FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE CASCADE
    )
  `);

  // Backups metadata table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      serverId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      size INTEGER,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE CASCADE
    )
  `);

  // Create default admin user if not exists
  const adminExists = _db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    // Generate a secure random password
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex');
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    _db.prepare(`
      INSERT INTO users (id, username, passwordHash, role)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), 'admin', hashedPassword, 'ADMIN');
    
    // Write credentials to a secure file instead of logging to console
    const credentialsPath = path.join(dataDir, 'admin_credentials.txt');
    const credentialsContent = `
================================================================================
DEFAULT ADMIN USER CREATED
================================================================================
Username: admin
Password: ${defaultPassword}

⚠️  IMPORTANT: 
   - Delete this file after saving the password!
   - Change this password immediately after first login.
   - This file contains sensitive information.
================================================================================
Created at: ${new Date().toISOString()}
`;
    fs.writeFileSync(credentialsPath, credentialsContent, { mode: 0o600 });
    
    // Log only that credentials were created, not the password itself
    initLogger.info({ credentialsFile: credentialsPath }, 'Admin user created. Credentials saved to file.');
    
    // Also print to console in development for convenience (without the password in logs)
    if (process.env.NODE_ENV !== 'production') {
      console.log('');
      console.log('='.repeat(60));
      console.log('DEFAULT ADMIN USER CREATED');
      console.log('='.repeat(60));
      console.log(`Credentials saved to: ${credentialsPath}`);
      console.log('');
      console.log('⚠️  IMPORTANT: Delete the credentials file after saving the password!');
      console.log('='.repeat(60));
      console.log('');
    }
  }

  // Create default templates
  const templatesExist = _db.prepare('SELECT COUNT(*) as count FROM templates').get();
  if (templatesExist.count === 0) {
    const defaultTemplates = [
      {
        id: uuidv4(),
        name: 'Vanilla 1.21',
        type: 'Vanilla',
        version: '1.21',
        jarFileName: 'server.jar',
        defaultMemory: 2048,
        jvmArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200'
      },
      {
        id: uuidv4(),
        name: 'Vanilla 1.20.4',
        type: 'Vanilla',
        version: '1.20.4',
        jarFileName: 'server.jar',
        defaultMemory: 2048,
        jvmArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200'
      },
      {
        id: uuidv4(),
        name: 'Paper 1.21',
        type: 'Paper',
        version: '1.21',
        jarFileName: 'paper.jar',
        defaultMemory: 4096,
        jvmArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC'
      },
      {
        id: uuidv4(),
        name: 'Paper 1.20.4',
        type: 'Paper',
        version: '1.20.4',
        jarFileName: 'paper.jar',
        defaultMemory: 4096,
        jvmArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC'
      }
    ];

    const insertTemplate = _db.prepare(`
      INSERT INTO templates (id, name, type, version, jarFileName, defaultMemory, jvmArgs)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of defaultTemplates) {
      insertTemplate.run(t.id, t.name, t.type, t.version, t.jarFileName, t.defaultMemory, t.jvmArgs);
    }
    console.log('Default templates created');
  }

  // Create backups directory
  const backupsDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}
