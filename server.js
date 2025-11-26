// server.js - MiniPaaS main server
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const { spawn, fork } = require('child_process');
const net = require('net');
const multer = require('multer');
const AdmZip = require('adm-zip');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pidusage = require('pidusage');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const simpleGit = require('simple-git');
const crypto = require('crypto');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[SYSTEM] Missing JWT_SECRET environment variable. Create a .env with JWT_SECRET.');
    process.exit(1);
}

// --- CONFIGURATION ---
const PORT = Number(process.env.PORT) || 5050;
const START_PORT = 5200;
const BASE_DIR = __dirname;
const APPS_DIR = path.join(BASE_DIR, 'apps');
const DATA_DIR = path.join(BASE_DIR, 'data');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const BACKUPS_DIR = path.join(BASE_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'apps.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SQLITE_FILE = path.join(DATA_DIR, 'database.sqlite');
const STATIC_RUNNER = path.join(BASE_DIR, 'static-runner.js');
const UPLOADS_DIR = path.join(BASE_DIR, 'public', 'uploads', 'branding');

// Auto-restart configuration
const AUTO_RESTART_MAX = Number(process.env.AUTO_RESTART_MAX) || 3;
const AUTO_RESTART_WINDOW = Number(process.env.AUTO_RESTART_WINDOW) || 300; // seconds

// Log rotation configuration
const LOG_MAX_SIZE_MB = Number(process.env.LOG_MAX_SIZE_MB) || 10;
const LOG_MAX_FILES = Number(process.env.LOG_MAX_FILES) || 5;

// CORS configuration
const CORS_ORIGINS = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];

// Ensure required directories exist
[APPS_DIR, DATA_DIR, LOGS_DIR, BACKUPS_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialise SQLite DB for users
const db = new sqlite3.Database(SQLITE_FILE);
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Configure CORS (must be defined before Socket.IO initialization)
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        // If CORS_ORIGINS is empty, allow localhost variations
        if (CORS_ORIGINS.length === 0) {
            const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
            if (localhostPattern.test(origin)) return callback(null, true);
        }
        // Check against allowed origins
        if (CORS_ORIGINS.includes(origin) || CORS_ORIGINS.includes('*')) {
            return callback(null, true);
        }
        callback(new Error('CORS not allowed'));
    },
    credentials: true
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: corsOptions
});

// Socket.IO authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication required'));
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return next(new Error('Invalid token'));
        }
        socket.user = user;
        next();
    });
});

const upload = multer({ 
    dest: path.join(BASE_DIR, 'temp_uploads'),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});
const brandingUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
    }),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for branding files
});

// In‑memory map of running processes
const runningProcesses = {};

// In-memory map of log streams (to close them properly)
const logStreams = {};

// In-memory map of restart counts for auto-restart policy
const restartCounts = {};

// Cache for disk sizes (updated periodically, not on every request)
const diskSizeCache = new Map();
const DISK_CACHE_TTL = 60000; // 1 minute TTL

app.use(cors(corsOptions));
// Capture raw JSON body for webhook signature validation
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.static(path.join(BASE_DIR, 'public')));

// --- UTILITIES ---
const getApps = () => {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
            return [];
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '[]');
    } catch (e) {
        console.error('[SYSTEM] getApps error', e);
        return [];
    }
};
const saveApps = apps => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(apps, null, 2));
};
const getSettings = () => {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}));
            return {};
        }
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8') || '{}');
    } catch (e) {
        console.error('[SYSTEM] getSettings error', e);
        return {};
    }
};
const saveSettings = settings => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
};

// Find a free port starting from a given number
const findAvailablePort = async startAt => {
    const isPortFree = port => new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, '0.0.0.0');
    });
    let port = startAt;
    while (!(await isPortFree(port))) {
        port++;
        if (port > 65000) throw new Error('No free ports');
    }
    return port;
};

// Calculate directory size in bytes (skips symlinks)
const calculateDirSize = async dir => {
    try {
        const stats = await fs.promises.stat(dir);
        if (!stats.isDirectory()) return stats.size;

        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        let total = 0;
        for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                total += await calculateDirSize(fullPath);
            } else {
                const fileStats = await fs.promises.stat(fullPath);
                total += fileStats.size;
            }
        }
        return total;
    } catch (e) {
        return 0;
    }
};

// Simple logger per app with rotation
const getLogStream = appName => {
    const logPath = path.join(LOGS_DIR, `${appName}.log`);
    
    // Check if we need to rotate
    if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB >= LOG_MAX_SIZE_MB) {
            rotateLog(appName);
        }
    }
    
    const stream = fs.createWriteStream(logPath, { flags: 'a' });
    logStreams[appName] = stream;
    return stream;
};

// Rotate log files
const rotateLog = (appName) => {
    const basePath = path.join(LOGS_DIR, `${appName}.log`);
    
    // Remove oldest if at max
    const oldestPath = `${basePath}.${LOG_MAX_FILES}`;
    if (fs.existsSync(oldestPath)) {
        fs.unlinkSync(oldestPath);
    }
    
    // Rotate existing logs
    for (let i = LOG_MAX_FILES - 1; i >= 1; i--) {
        const oldPath = i === 1 ? basePath : `${basePath}.${i}`;
        const newPath = `${basePath}.${i + 1}`;
        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
        }
    }
    
    console.log(`[SYSTEM] Rotated logs for ${appName}`);
};

// Close log stream for an app
const closeLogStream = (appName) => {
    if (logStreams[appName]) {
        logStreams[appName].end();
        delete logStreams[appName];
    }
};

// Clean old logs on startup
const cleanOldLogs = () => {
    try {
        const files = fs.readdirSync(LOGS_DIR);
        const logGroups = {};
        
        files.forEach(file => {
            const match = file.match(/^(.+)\.log(\.\d+)?$/);
            if (match) {
                const appName = match[1];
                if (!logGroups[appName]) logGroups[appName] = [];
                logGroups[appName].push(file);
            }
        });
        
        // Remove logs for apps that no longer exist
        const apps = getApps();
        const appNames = apps.map(a => a.name);
        Object.keys(logGroups).forEach(name => {
            if (!appNames.includes(name)) {
                logGroups[name].forEach(file => {
                    fs.unlinkSync(path.join(LOGS_DIR, file));
                    console.log(`[SYSTEM] Removed orphan log: ${file}`);
                });
            }
        });
    } catch (e) {
        console.error('[SYSTEM] Error cleaning logs:', e);
    }
};

// Start an application (static or node)
const startAppProcess = (appData, isRestart = false) => {
    const { name, port, type, path: appPath, env = {} } = appData;
    
    // Close existing log stream if any
    closeLogStream(name);
    const logStream = getLogStream(name);
    console.log(`[SYSTEM] Starting ${name} (${type}) on port ${port}`);

    // Merge system env with app env
    const appEnv = { ...process.env, ...env, PORT: String(port) };

    if (!fs.existsSync(appPath)) {
        console.error(`[SYSTEM] Error: App directory ${appPath} does not exist. Skipping ${name}.`);
        updateAppStatus(name, 'stopped');
        closeLogStream(name);
        return;
    }

    let child;
    if (type === 'static') {
        child = fork(STATIC_RUNNER, [port, appPath], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    } else {
        const pkgPath = path.join(appPath, 'package.json');
        let startCmd = process.execPath;
        let startArgs = [];
        let useShell = false;

        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                const startScript = pkg.scripts?.start;

                // Optimization: If start script is simple "node server.js", run directly to get correct PID
                if (startScript && startScript.trim().startsWith('node ')) {
                    const parts = startScript.trim().split(' ');
                    if (parts.length === 2) {
                        startArgs = [parts[1]];
                    } else {
                        // Fallback to npm start if complex args
                        startCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                        startArgs = ['start'];
                        useShell = true;
                    }
                } else {
                    startCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                    startArgs = ['start'];
                    useShell = true;
                }
            } catch (e) {
                // Fallback
                startCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                startArgs = ['start'];
                useShell = true;
            }
        } else {
            const entry = fs.existsSync(path.join(appPath, 'server.js')) ? 'server.js' : 'index.js';
            startArgs = [entry];
        }

        child = spawn(startCmd, startArgs, { cwd: appPath, env: appEnv, stdio: ['ignore', 'pipe', 'pipe'], shell: useShell });
    }

    const broadcastLog = (data, type) => {
        const msg = data.toString();
        logStream.write(`[${type}] ${msg}`);
        io.emit(`log:${name}`, msg); // Real-time logs
    };

    if (child.stdout) child.stdout.on('data', d => broadcastLog(d, 'STDOUT'));
    if (child.stderr) child.stderr.on('data', d => broadcastLog(d, 'STDERR'));

    child.on('close', code => {
        logStream.write(`[SYSTEM] Process exited with code ${code}\n`);
        closeLogStream(name);
        delete runningProcesses[name];
        updateAppStatus(name, 'stopped');
        io.emit(`status:${name}`, 'stopped');
        
        // Auto-restart logic if process crashed (non-zero exit)
        if (code !== 0 && code !== null) {
            const apps = getApps();
            const app = apps.find(a => a.name === name);
            if (app && app.autoRestart !== false) {
                const now = Date.now();
                if (!restartCounts[name]) {
                    restartCounts[name] = { count: 0, firstRestart: now };
                }
                
                // Reset counter if outside window
                if (now - restartCounts[name].firstRestart > AUTO_RESTART_WINDOW * 1000) {
                    restartCounts[name] = { count: 0, firstRestart: now };
                }
                
                if (restartCounts[name].count < AUTO_RESTART_MAX) {
                    restartCounts[name].count++;
                    console.log(`[SYSTEM] Auto-restarting ${name} (attempt ${restartCounts[name].count}/${AUTO_RESTART_MAX})`);
                    setTimeout(() => startAppProcess(app, true), 3000);
                } else {
                    console.log(`[SYSTEM] ${name} crashed too many times, not restarting`);
                    io.emit(`crash:${name}`, { message: 'App crashed too many times' });
                }
            }
        }
    });

    // Reset restart count on successful start after some time
    setTimeout(() => {
        if (runningProcesses[name]) {
            delete restartCounts[name];
        }
    }, 30000);

    runningProcesses[name] = child;
    updateAppStatus(name, 'running');
    io.emit(`status:${name}`, 'running');
};

const stopAppProcess = (name, markStopped = true) => {
    if (runningProcesses[name]) {
        console.log(`[SYSTEM] Stopping ${name}`);
        // Clear auto-restart counter to prevent restart after manual stop
        delete restartCounts[name];
        runningProcesses[name].kill();
        delete runningProcesses[name];
        closeLogStream(name);
        if (markStopped) {
            updateAppStatus(name, 'stopped');
        }
    }
};

// Update status field in apps JSON
const updateAppStatus = (name, status) => {
    const apps = getApps();
    const idx = apps.findIndex(a => a.name === name);
    if (idx !== -1) {
        apps[idx].status = status;
        saveApps(apps);
    }
};

// --- MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Acceso denegado' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') return next();
    res.status(403).json({ error: 'Requiere privilegios de administrador' });
};

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
    windowMs: (Number(process.env.RATE_LIMIT_WINDOW) || 15) * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 5,
    standardHeaders: true,
    legacyHeaders: false
});

// --- AUTH ENDPOINTS ---
// Check if public registration is available (only if no users exist)
app.get('/api/auth/can-register', (req, res) => {
    db.get('SELECT COUNT(*) as cnt FROM users', (err, row) => {
        if (err) return res.status(500).json({ canRegister: false });
        res.json({ canRegister: row.cnt === 0 });
    });
});

app.post('/api/auth/register', authLimiter, (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Datos incompletos' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email inválido' });
    if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });
    db.get('SELECT COUNT(*) as cnt FROM users', (err, row) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        // Solo permitir registro del primer usuario (admin). Resto de registros deben ser por admin.
        if (row.cnt > 0) return res.status(403).json({ error: 'El registro público está deshabilitado. Pide a un admin que te cree un usuario.' });
        const role = 'admin';
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Hash error' });
            const stmt = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)');
            stmt.run(email, hash, role, function (err) {
                if (err) return res.status(500).json({ error: 'Crear usuario' });
                const token = jwt.sign({ id: this.lastID, email, role }, JWT_SECRET, { expiresIn: '24h' });
                res.json({ status: 'ok', userId: this.lastID, role, token });
            });
            stmt.finalize();
        });
    });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });
        bcrypt.compare(password, user.password, (err, ok) => {
            if (err || !ok) return res.status(401).json({ error: 'Credenciales incorrectas' });
            const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ status: 'ok', token, role: user.role });
        });
    });
});

const createBackup = () => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUPS_DIR, `backup_${timestamp}.zip`);
        const zip = new AdmZip();
        zip.addLocalFolder(APPS_DIR, 'apps');
        zip.addLocalFolder(DATA_DIR, 'data');
        zip.writeZip(backupPath);
        console.log(`[SYSTEM] Backup created: ${backupPath}`);
        cleanOldBackups();
    } catch (e) {
        console.error('[SYSTEM] Backup error:', e);
    }
};

const cleanOldBackups = () => {
    try {
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
            .map(f => ({ name: f, path: path.join(BACKUPS_DIR, f), time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);
        const MAX = 5;
        if (files.length > MAX) {
            files.slice(MAX).forEach(f => {
                fs.unlinkSync(f.path);
                console.log(`[SYSTEM] Old backup removed: ${f.name}`);
            });
        }
    } catch (e) {
        console.error('[SYSTEM] Cleanup error:', e);
    }
};

// --- SETTINGS ENDPOINTS ---
app.get('/api/settings', (req, res) => {
    try {
        const settings = getSettings();
        res.json(settings);
    } catch (e) {
        res.json({});
    }
});

app.post('/api/admin/settings', authenticateToken, requireAdmin, brandingUpload.fields([
    { name: 'logoLight', maxCount: 1 },
    { name: 'logoDark', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
]), (req, res) => {
    try {
        const settings = getSettings();
        const { appName, showAppName } = req.body;

        if (appName !== undefined) settings.appName = appName;
        // FIX: Parse boolean string
        if (showAppName !== undefined) settings.showAppName = showAppName === 'true';

        if (req.files['logoLight']) {
            settings.logoLight = `/uploads/branding/${req.files['logoLight'][0].filename}`;
        }
        if (req.files['logoDark']) {
            settings.logoDark = `/uploads/branding/${req.files['logoDark'][0].filename}`;
        }
        if (req.files['favicon']) {
            settings.favicon = `/uploads/branding/${req.files['favicon'][0].filename}`;
        }

        saveSettings(settings);
        res.json({ status: 'ok' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error guardando configuración' });
    }
});

// --- USER MANAGEMENT ENDPOINTS ---
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    db.all('SELECT id, email, role, created_at FROM users', (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(rows);
    });
});

app.post('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Datos incompletos' });
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Hash error' });
        const stmt = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)');
        stmt.run(email, hash, role || 'user', function (err) {
            if (err) return res.status(500).json({ error: 'Error creando usuario' });
            res.json({ status: 'ok', id: this.lastID });
        });
        stmt.finalize();
    });
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const currentUserId = req.user.id;

    // Prevent self-deletion
    if (id === currentUserId) {
        return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    // Check if this is the last admin
    db.get('SELECT role FROM users WHERE id = ?', id, (err, targetUser) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (targetUser.role === 'admin') {
            // Count remaining admins
            db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', 'admin', (err, result) => {
                if (err) return res.status(500).json({ error: 'DB error' });
                if (result.count <= 1) {
                    return res.status(400).json({ error: 'No puedes eliminar el ultimo administrador' });
                }
                // Safe to delete
                db.run('DELETE FROM users WHERE id = ?', id, function (err) {
                    if (err) return res.status(500).json({ error: 'DB error' });
                    res.json({ status: 'ok' });
                });
            });
        } else {
            // Not an admin, safe to delete
            db.run('DELETE FROM users WHERE id = ?', id, function (err) {
                if (err) return res.status(500).json({ error: 'DB error' });
                res.json({ status: 'ok' });
            });
        }
    });
});

// --- PROFILE ENDPOINT ---
app.put('/api/auth/profile', authenticateToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Usuario no encontrado' });

        bcrypt.compare(currentPassword, user.password, (err, ok) => {
            if (err || !ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

            bcrypt.hash(newPassword, 10, (err, hash) => {
                if (err) return res.status(500).json({ error: 'Hash error' });
                db.run('UPDATE users SET password = ? WHERE id = ?', [hash, userId], (err) => {
                    if (err) return res.status(500).json({ error: 'Update error' });
                    res.json({ status: 'ok', message: 'Contraseña actualizada' });
                });
            });
        });
    });
});

// --- APPS ENDPOINTS ---

// Get cached disk size (non-blocking)
const getCachedDiskSize = (appName, appPath) => {
    const cached = diskSizeCache.get(appName);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < DISK_CACHE_TTL) {
        return cached.sizeMB;
    }
    // Return cached value if exists, trigger async update
    if (fs.existsSync(appPath)) {
        calculateDirSize(appPath).then(bytes => {
            diskSizeCache.set(appName, { sizeMB: Math.round(bytes / (1024 * 1024)), timestamp: Date.now() });
        }).catch(() => {});
    }
    return cached ? cached.sizeMB : 0;
};

// Get all apps (protected) - uses cached disk sizes to avoid blocking
app.get('/api/apps', authenticateToken, requireAdmin, (req, res) => {
    try {
        const apps = getApps();
        const appsWithDisk = apps.map(app => {
            const appPath = app.path || path.join(APPS_DIR, app.name);
            const diskMB = getCachedDiskSize(app.name, appPath);
            return { ...app, diskMB };
        });
        res.json(appsWithDisk);
    } catch (e) {
        res.status(500).json({ error: 'Error leyendo aplicaciones' });
    }
});

// Deploy new app
app.post('/api/apps', authenticateToken, requireAdmin, upload.single('zipFile'), async (req, res) => {
    const { name, gitUrl, branch } = req.body;
    const file = req.file;

    if (!name) return res.status(400).json({ error: 'Faltan datos: name' });

    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const appPath = path.join(APPS_DIR, safeName);

    if (fs.existsSync(appPath)) {
        return res.status(400).json({ error: 'La aplicación ya existe' });
    }

    try {
        // Prepare directory
        fs.mkdirSync(appPath, { recursive: true });

        let deployMethod = 'zip';
        let gitCommit = null;
        const gitBranch = branch || 'main';

        if (gitUrl) {
            // Ensure git is available
            try {
                require('child_process').execSync('git --version');
            } catch (err) {
                throw new Error('Git no está instalado en el host');
            }

            // Clone repository
            await simpleGit().clone(gitUrl, appPath, ['--branch', gitBranch, '--depth', '1']);
            const localGit = simpleGit(appPath);
            try {
                gitCommit = await localGit.revparse(['--short', 'HEAD']);
            } catch (e) {
                // ignore
            }
            deployMethod = 'git';
        } else if (file) {
            const zip = new AdmZip(file.path);
            const entries = zip.getEntries();
            for (const entry of entries) {
                const entryPath = entry.entryName;
                // Prevent Zip Slip (../ or absolute paths)
                const targetPath = path.join(appPath, entryPath);
                const resolved = path.resolve(targetPath);
                if (!(resolved === appPath || resolved.startsWith(appPath + path.sep))) {
                    fs.unlinkSync(file.path);
                    throw new Error('El ZIP contiene rutas no permitidas');
                }

                if (entry.isDirectory) {
                    fs.mkdirSync(resolved, { recursive: true });
                } else {
                    fs.mkdirSync(path.dirname(resolved), { recursive: true });
                    fs.writeFileSync(resolved, entry.getData());
                }
            }
            fs.unlinkSync(file.path); // Clean temp file

            // Remove node_modules if present in zip to ensure clean install
            const uploadedModules = path.join(appPath, 'node_modules');
            if (fs.existsSync(uploadedModules)) {
                console.log(`[SYSTEM] Removing uploaded node_modules for ${safeName}...`);
                fs.rmSync(uploadedModules, { recursive: true, force: true });
            }
        } else {
            throw new Error('Faltan datos: subir zip o proporcionar gitUrl');
        }

        // Detect type
        const isNode = fs.existsSync(path.join(appPath, 'package.json'));
        const type = isNode ? 'node' : 'static';

        // Install dependencies if Node
        if (isNode) {
            console.log(`[SYSTEM] Installing dependencies for ${safeName}...`);
            const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
            require('child_process').execSync(`${npmCmd} install --production`, { cwd: appPath });
        }

        // Assign Port
        const apps = getApps();
        const lastPort = apps.length > 0 ? Math.max(...apps.map(a => a.port)) : START_PORT - 1;
        const port = await findAvailablePort(lastPort + 1);

        // Create initial version metadata
        const versionId = `v${Date.now()}`;
        const versionMeta = {
            versionId,
            deployDate: new Date().toISOString(),
            deployMethod,
            gitUrl: gitUrl || null,
            gitBranch: gitUrl ? gitBranch : null,
            gitCommit: gitCommit || null,
            path: appPath
        };

        // Save Metadata
        const newApp = {
            name: safeName,
            port,
            type,
            path: appPath,
            status: 'stopped',
            deployDate: new Date().toISOString(),
            versions: [versionMeta],
            currentVersion: versionId,
            health: { status: 'unknown', lastCheck: null, responseTime: null }
        };
        apps.push(newApp);
        saveApps(apps);

        // Start
        startAppProcess(newApp);

        res.json({ status: 'ok', app: newApp });

    } catch (e) {
        console.error(e);
        // Cleanup if failed
        if (fs.existsSync(appPath)) fs.rmSync(appPath, { recursive: true, force: true });
        res.status(500).json({ error: 'Error en despliegue: ' + e.message });
    }
});

// Delete app
app.delete('/api/apps/:name', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appIndex = apps.findIndex(a => a.name === name);

    if (appIndex === -1) return res.status(404).json({ error: 'App no encontrada' });

    try {
        // Stop process
        stopAppProcess(name);

        // Remove folder
        const appPath = apps[appIndex].path;
        if (fs.existsSync(appPath)) {
            fs.rmSync(appPath, { recursive: true, force: true });
        }

        // Update DB
        apps.splice(appIndex, 1);
        saveApps(apps);

        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: 'Error eliminando app' });
    }
});

// Restart app
app.post('/api/apps/:name/restart', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);

    if (!appData) return res.status(404).json({ error: 'App no encontrada' });

    try {
        stopAppProcess(name);
        setTimeout(() => {
            startAppProcess(appData);
            res.json({ status: 'ok' });
        }, 1000);
    } catch (e) {
        res.status(500).json({ error: 'Error reiniciando' });
    }
});

// Start app
app.post('/api/apps/:name/start', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);

    if (!appData) return res.status(404).json({ error: 'App no encontrada' });

    if (runningProcesses[name]) {
        return res.status(400).json({ error: 'App ya está en ejecución' });
    }

    try {
        startAppProcess(appData);
        res.json({ status: 'ok', message: `${name} iniciada` });
    } catch (e) {
        res.status(500).json({ error: 'Error iniciando app' });
    }
});

// Stop app
app.post('/api/apps/:name/stop', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);

    if (!appData) return res.status(404).json({ error: 'App no encontrada' });

    if (!runningProcesses[name]) {
        return res.status(400).json({ error: 'App no está en ejecución' });
    }

    try {
        stopAppProcess(name);
        res.json({ status: 'ok', message: `${name} detenida` });
    } catch (e) {
        res.status(500).json({ error: 'Error deteniendo app' });
    }
});

// Get Logs
app.get('/api/apps/:name/logs', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const logPath = path.join(LOGS_DIR, `${name}.log`);

    if (!fs.existsSync(logPath)) return res.json({ logs: 'No hay logs disponibles.' });

    // Read last 200 lines approx (simple implementation)
    fs.readFile(logPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Error leyendo logs' });
        const lines = data.split('\n');
        const lastLines = lines.slice(-200).join('\n');
        res.json({ logs: lastLines });
    });
});

// --- ENV VARIABLES ENDPOINTS ---
app.get('/api/apps/:name/env', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);
    if (!appData) return res.status(404).json({ error: 'App no encontrada' });
    res.json(appData.env || {});
});

app.post('/api/apps/:name/env', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const envVars = req.body; // Expecting object { KEY: "VALUE" }
    const apps = getApps();
    const idx = apps.findIndex(a => a.name === name);

    if (idx === -1) return res.status(404).json({ error: 'App no encontrada' });

    apps[idx].env = envVars;
    saveApps(apps);
    res.json({ status: 'ok' });
});

// --- FILE MANAGER ENDPOINTS ---
app.get('/api/apps/:name/files', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const relPath = req.query.path || '';
    const apps = getApps();
    const appData = apps.find(a => a.name === name);

    if (!appData) return res.status(404).json({ error: 'App no encontrada' });

    const normalized = path.normalize(path.join(appData.path, relPath || ''));
    const resolved = path.resolve(normalized);
    const appRoot = path.resolve(appData.path);
    // Prevent path traversal: resolved must be within appRoot
    if (!(resolved === appRoot || resolved.startsWith(appRoot + path.sep))) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }

    const targetPath = resolved;

    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Ruta no encontrada' });

    try {
        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) return res.status(400).json({ error: 'No es un directorio' });

        const files = fs.readdirSync(targetPath).map(f => {
            const fullPath = path.join(targetPath, f);
            const fStats = fs.statSync(fullPath);
            return {
                name: f,
                isDirectory: fStats.isDirectory(),
                size: fStats.size,
                path: path.join(relPath, f).replace(/\\/g, '/')
            };
        });

        // Sort directories first
        files.sort((a, b) => (a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1));

        res.json(files);
    } catch (e) {
        res.status(500).json({ error: 'Error leyendo directorio' });
    }
});

app.get('/api/apps/:name/files/content', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const relPath = req.query.path;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);

    if (!appData || !relPath) return res.status(400).json({ error: 'Datos inválidos' });

    const normalized = path.normalize(path.join(appData.path, relPath || ''));
    const resolved = path.resolve(normalized);
    const appRoot = path.resolve(appData.path);
    if (!(resolved === appRoot || resolved.startsWith(appRoot + path.sep))) return res.status(403).json({ error: 'Acceso denegado' });
    const targetPath = resolved;

    try {
        if (fs.statSync(targetPath).size > 1024 * 1024) { // 1MB limit
            return res.status(400).json({ error: 'Archivo muy grande para editar' });
        }
        const content = fs.readFileSync(targetPath, 'utf8');
        res.json({ content });
    } catch (e) {
        res.status(500).json({ error: 'Error leyendo archivo' });
    }
});

app.post('/api/apps/:name/files/content', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const { path: relPath, content } = req.body;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);

    if (!appData || !relPath) return res.status(400).json({ error: 'Datos inválidos' });

    const normalized = path.normalize(path.join(appData.path, relPath || ''));
    const resolved = path.resolve(normalized);
    const appRoot = path.resolve(appData.path);
    if (!(resolved === appRoot || resolved.startsWith(appRoot + path.sep))) return res.status(403).json({ error: 'Acceso denegado' });
    const targetPath = resolved;

    try {
        fs.writeFileSync(targetPath, content, 'utf8');
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: 'Error guardando archivo' });
    }
});

// --- MONITORING LOOP ---
setInterval(async () => {
    const stats = {};
    const procs = Object.entries(runningProcesses);

    for (const [name, child] of procs) {
        try {
            if (child.pid) {
                const stat = await pidusage(child.pid);
                stats[name] = {
                    cpu: stat.cpu.toFixed(1),
                    memory: Math.round(stat.memory / 1024 / 1024) // MB
                };
            }
        } catch (e) {
            // Process might have died
        }
    }

    if (Object.keys(stats).length > 0) {
        io.emit('stats', stats);
    }
}, 2000);

// --- VERSIONING & HEALTH HELPERS ---
const createAppVersion = (appName, deployMethod = 'manual', meta = {}) => {
    const apps = getApps();
    const idx = apps.findIndex(a => a.name === appName);
    if (idx === -1) throw new Error('App no encontrada');

    const app = apps[idx];
    const versionsDir = path.join(APPS_DIR, appName, 'versions');
    if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true });
    const versionId = `v${Date.now()}`;
    const versionPath = path.join(versionsDir, versionId);
    fs.mkdirSync(versionPath, { recursive: true });
    // Copy current app into version folder
    if (fs.existsSync(app.path)) {
        fs.cpSync(app.path, versionPath, { recursive: true });
    }

    const versionMeta = Object.assign({
        versionId,
        deployDate: new Date().toISOString(),
        deployMethod,
        gitUrl: meta.gitUrl || null,
        gitBranch: meta.gitBranch || null,
        gitCommit: meta.gitCommit || null,
        path: versionPath
    }, meta);

    app.versions = app.versions || [];
    app.versions.push(versionMeta);
    app.currentVersion = versionId;
    saveApps(apps);
    return versionMeta;
};

// List versions
app.get('/api/apps/:name/versions', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);
    if (!appData) return res.status(404).json({ error: 'App no encontrada' });
    res.json(appData.versions || []);
});

// Rollback to a version
app.post('/api/apps/:name/rollback', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const { versionId } = req.body;
    if (!versionId) return res.status(400).json({ error: 'versionId requerido' });
    const apps = getApps();
    const idx = apps.findIndex(a => a.name === name);
    if (idx === -1) return res.status(404).json({ error: 'App no encontrada' });
    const appData = apps[idx];

    const version = (appData.versions || []).find(v => v.versionId === versionId);
    if (!version) return res.status(404).json({ error: 'Versión no encontrada' });

    // Prevent rollback to same version in same path (would copy over itself)
    if (version.path === appData.path && versionId === appData.currentVersion) {
        return res.status(400).json({ error: 'Ya estás en esta versión' });
    }

    try {
        // Stop current
        stopAppProcess(name);

        // Replace current with version (only if paths differ)
        if (version.path !== appData.path) {
            if (fs.existsSync(appData.path)) {
                fs.rmSync(appData.path, { recursive: true, force: true });
            }
            fs.mkdirSync(appData.path, { recursive: true });
            fs.cpSync(version.path, appData.path, { recursive: true });
        }

        // Update metadata
        appData.currentVersion = versionId;
        saveApps(apps);

        // Restart
        setTimeout(() => startAppProcess(appData), 500);
        res.json({ status: 'ok' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Rollback failed: ' + e.message });
    }
});

// --- WEBHOOK ENDPOINT FOR CI/CD ---
// GitHub/GitLab webhook for auto-deploy
app.post('/api/apps/:name/webhook', async (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);

    if (!appData) return res.status(404).json({ error: 'App no encontrada' });

    // Check if app has a git URL configured
    const currentVersion = (appData.versions || []).find(v => v.versionId === appData.currentVersion);
    if (!currentVersion || !currentVersion.gitUrl) {
        return res.status(400).json({ error: 'App no tiene repositorio Git configurado' });
    }

    // REQUIRED: Verify webhook signature (GitHub uses X-Hub-Signature-256)
    const webhookSecret = appData.webhookSecret;
    if (!webhookSecret) {
        return res.status(403).json({ error: 'Webhook no configurado. Configura un secreto primero en /api/apps/:name/webhook/configure' });
    }
    
    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !req.rawBody) {
        return res.status(401).json({ error: 'Missing webhook signature' });
    }
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
    const sigBuffer = Buffer.from(signature);
    const digestBuffer = Buffer.from(digest);
    if (sigBuffer.length !== digestBuffer.length || !crypto.timingSafeEqual(sigBuffer, digestBuffer)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Parse payload if needed (already parsed by express.json)
    let payload = {};
    try {
        if (req.rawBody && (!req.body || Object.keys(req.body).length === 0)) {
            payload = JSON.parse(req.rawBody.toString('utf8'));
        } else {
            payload = req.body || {};
        }
    } catch (e) {
        // Ignore parsing errors
    }

    console.log(`[WEBHOOK] Received webhook for ${name}`);

    try {
        // Stop current app
        stopAppProcess(name);

        // Pull latest changes
        const git = simpleGit(appData.path);
        await git.fetch();
        await git.pull('origin', currentVersion.gitBranch || 'main');
        
        // Get new commit hash
        let newCommit = null;
        try {
            newCommit = await git.revparse(['--short', 'HEAD']);
        } catch (e) {
            // ignore
        }

        // Reinstall dependencies if Node app
        if (appData.type === 'node') {
            const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
            require('child_process').execSync(`${npmCmd} install --production`, { cwd: appData.path });
        }

        // Create new version entry
        const versionId = `v${Date.now()}`;
        const versionMeta = {
            versionId,
            deployDate: new Date().toISOString(),
            deployMethod: 'webhook',
            gitUrl: currentVersion.gitUrl,
            gitBranch: currentVersion.gitBranch || 'main',
            gitCommit: newCommit ? newCommit.trim() : null,
            path: appData.path
        };
        appData.versions = appData.versions || [];
        appData.versions.push(versionMeta);
        appData.currentVersion = versionId;
        saveApps(apps);

        // Restart app
        startAppProcess(appData);

        res.json({ status: 'ok', message: 'Deployed via webhook', commit: newCommit });
    } catch (e) {
        console.error('[WEBHOOK] Error:', e);
        res.status(500).json({ error: 'Webhook deploy failed: ' + e.message });
    }
});

// Configure webhook secret for an app
app.post('/api/apps/:name/webhook/configure', authenticateToken, requireAdmin, (req, res) => {
    const name = req.params.name;
    const { secret } = req.body;
    
    const apps = getApps();
    const idx = apps.findIndex(a => a.name === name);
    if (idx === -1) return res.status(404).json({ error: 'App no encontrada' });
    
    apps[idx].webhookSecret = secret || null;
    saveApps(apps);
    
    const webhookUrl = `${req.protocol}://${req.get('host')}/api/apps/${name}/webhook`;
    res.json({ status: 'ok', webhookUrl });
});

// --- HEALTH ENDPOINTS ---
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    const dbStatus = fs.existsSync(SQLITE_FILE) ? 'connected' : 'missing';
    const fsStatus = fs.existsSync(APPS_DIR) ? 'ok' : 'missing';
    const apps = getApps();
    res.json({ status: 'ok', uptime: Math.round(uptime), dbStatus, fsStatus, totalApps: apps.length });
});

app.get('/api/apps/:name/health', authenticateToken, requireAdmin, async (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);
    if (!appData) return res.status(404).json({ error: 'App no encontrada' });

    const result = { status: 'unknown', lastCheck: new Date().toISOString(), responseTime: null };
    // Check process
    result.status = runningProcesses[name] ? 'running' : 'stopped';

    // Try HTTP request
    try {
        const start = Date.now();
        const reqOptions = { method: 'GET', host: '127.0.0.1', port: appData.port, path: '/', timeout: 3000 };
        const r = http.request(reqOptions, rres => {
            const ms = Date.now() - start;
            result.responseTime = ms;
            result.status = rres.statusCode >= 200 && rres.statusCode < 400 ? 'healthy' : 'unhealthy';
            appData.health = { status: result.status, lastCheck: result.lastCheck, responseTime: result.responseTime };
            saveApps(apps);
            res.json(result);
        });
        r.on('error', err => {
            result.status = 'unhealthy';
            result.responseTime = null;
            appData.health = { status: result.status, lastCheck: result.lastCheck, responseTime: result.responseTime };
            saveApps(apps);
            res.json(result);
        });
        r.end();
    } catch (e) {
        result.status = 'unhealthy';
        appData.health = { status: result.status, lastCheck: result.lastCheck, responseTime: null };
        saveApps(apps);
        res.json(result);
    }
});

// Health check scheduler: update app health every 60s
setInterval(() => {
    const apps = getApps();
    let pendingChecks = apps.length;
    let modified = false;
    
    if (pendingChecks === 0) return;

    apps.forEach((appData, index) => {
        const name = appData.name;
        const start = Date.now();
        const reqOptions = { method: 'GET', host: '127.0.0.1', port: appData.port, path: '/', timeout: 3000 };
        const reqHealth = http.request(reqOptions, rres => {
            const ms = Date.now() - start;
            const status = rres.statusCode >= 200 && rres.statusCode < 400 ? 'healthy' : 'unhealthy';
            apps[index].health = { status, lastCheck: new Date().toISOString(), responseTime: ms };
            modified = true;
            io.emit(`health:${name}`, apps[index].health);
            rres.resume(); // Consume response to free up memory
            checkComplete();
        });
        reqHealth.on('error', () => {
            apps[index].health = { status: 'unhealthy', lastCheck: new Date().toISOString(), responseTime: null };
            modified = true;
            io.emit(`health:${name}`, apps[index].health);
            checkComplete();
        });
        reqHealth.on('timeout', () => {
            reqHealth.destroy();
            apps[index].health = { status: 'unhealthy', lastCheck: new Date().toISOString(), responseTime: null };
            modified = true;
            io.emit(`health:${name}`, apps[index].health);
            checkComplete();
        });
        reqHealth.end();
    });
    
    function checkComplete() {
        pendingChecks--;
        if (pendingChecks === 0 && modified) {
            saveApps(apps); // Save only once after all checks complete
        }
    }
}, 60 * 1000);

// --- PATH CORRECTION ---
const sanitizeAppPaths = () => {
    const apps = getApps();
    let changed = false;
    apps.forEach(app => {
        // If path is missing or doesn't exist, try to find it in APPS_DIR
        if (!app.path || !fs.existsSync(app.path)) {
            const candidate = path.join(APPS_DIR, app.name);
            if (fs.existsSync(candidate)) {
                console.log(`[SYSTEM] Auto-correcting path for ${app.name}: ${app.path} => ${candidate}`);
                app.path = candidate;
                changed = true;
            }
        }
    });
    if (changed) saveApps(apps);
};

// --- SERVER STARTUP ---
const init = () => {
    sanitizeAppPaths(); // Fix paths before starting
    cleanOldLogs(); // Clean orphan logs
    const apps = getApps();
    console.log(`[SYSTEM] MiniPaaS started. ${apps.length} apps loaded.`);
    apps.forEach(app => startAppProcess(app));
    setInterval(createBackup, 24 * 60 * 60 * 1000);
    setTimeout(createBackup, 5000);
};

// --- GRACEFUL SHUTDOWN ---
const gracefulShutdown = (signal) => {
    console.log(`\n[SYSTEM] Received ${signal}. Shutting down gracefully...`);
    
    // Stop all running apps
    const appNames = Object.keys(runningProcesses);
    console.log(`[SYSTEM] Stopping ${appNames.length} running apps...`);
    appNames.forEach(name => {
        stopAppProcess(name, false);
    });
    
    // Close all log streams
    Object.keys(logStreams).forEach(name => {
        closeLogStream(name);
    });
    
    // Close database
    db.close((err) => {
        if (err) console.error('[SYSTEM] Error closing database:', err);
        else console.log('[SYSTEM] Database closed.');
    });
    
    // Close HTTP server
    server.close(() => {
        console.log('[SYSTEM] HTTP server closed.');
        process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('[SYSTEM] Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n>>> MINI PAAS running at http://localhost:${PORT}`);
    console.log(`>>> Base directory: ${BASE_DIR}`);
    init();
});
