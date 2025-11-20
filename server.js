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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const upload = multer({ dest: path.join(BASE_DIR, 'temp_uploads') });
const brandingUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
    })
});

// In‑memory map of running processes
const runningProcesses = {};

app.use(cors());
app.use(express.json());
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

// Simple logger per app
const getLogStream = appName => {
    const logPath = path.join(LOGS_DIR, `${appName}.log`);
    return fs.createWriteStream(logPath, { flags: 'a' });
};

// Start an application (static or node)
const startAppProcess = appData => {
    const { name, port, type, path: appPath, env = {} } = appData;
    const logStream = getLogStream(name);
    console.log(`[SYSTEM] Starting ${name} (${type}) on port ${port}`);

    // Merge system env with app env
    const appEnv = { ...process.env, ...env, PORT: String(port) };

    if (!fs.existsSync(appPath)) {
        console.error(`[SYSTEM] Error: App directory ${appPath} does not exist. Skipping ${name}.`);
        updateAppStatus(name, 'stopped');
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
        delete runningProcesses[name];
        updateAppStatus(name, 'stopped');
        io.emit(`status:${name}`, 'stopped');
    });

    runningProcesses[name] = child;
    updateAppStatus(name, 'running');
    io.emit(`status:${name}`, 'running');
};

const stopAppProcess = name => {
    if (runningProcesses[name]) {
        console.log(`[SYSTEM] Stopping ${name}`);
        runningProcesses[name].kill();
        delete runningProcesses[name];
        updateAppStatus(name, 'stopped');
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
app.post('/api/auth/register', authLimiter, (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Datos incompletos' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email inválido' });
    if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });
    db.get('SELECT COUNT(*) as cnt FROM users', (err, row) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        const role = row.cnt === 0 ? 'admin' : 'user';
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Hash error' });
            const stmt = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)');
            stmt.run(email, hash, role, function (err) {
                if (err) return res.status(500).json({ error: 'Crear usuario' });
                res.json({ status: 'ok', userId: this.lastID, role });
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
    const id = req.params.id;
    db.run('DELETE FROM users WHERE id = ?', id, function (err) {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ status: 'ok' });
    });
});

// --- PROFILE ENDPOINT ---
app.put('/api/auth/profile', authenticateToken, (req, res) => {
    const { email, password, newPassword } = req.body;
    const userId = req.user.id;

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (password) {
            bcrypt.compare(password, user.password, (err, ok) => {
                if (err || !ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

                let query = 'UPDATE users SET email = ?';
                let params = [email];

                if (newPassword) {
                    bcrypt.hash(newPassword, 10, (err, hash) => {
                        if (err) return res.status(500).json({ error: 'Hash error' });
                        query += ', password = ? WHERE id = ?';
                        params.push(hash, userId);
                        db.run(query, params, (err) => {
                            if (err) return res.status(500).json({ error: 'Update error' });
                            res.json({ status: 'ok' });
                        });
                    });
                } else {
                    query += ' WHERE id = ?';
                    params.push(userId);
                    db.run(query, params, (err) => {
                        if (err) return res.status(500).json({ error: 'Update error' });
                        res.json({ status: 'ok' });
                    });
                }
            });
        } else {
            return res.status(400).json({ error: 'Contraseña actual requerida' });
        }
    });
});

// --- APPS ENDPOINTS ---

// Get all apps
app.get('/api/apps', (req, res) => {
    try {
        const apps = getApps();
        res.json(apps);
    } catch (e) {
        res.status(500).json({ error: 'Error leyendo aplicaciones' });
    }
});

// Deploy new app
app.post('/api/apps', authenticateToken, upload.single('zipFile'), async (req, res) => {
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
            zip.extractAllTo(appPath, true);
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
app.delete('/api/apps/:name', authenticateToken, (req, res) => {
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
app.post('/api/apps/:name/restart', authenticateToken, (req, res) => {
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

// Get Logs
app.get('/api/apps/:name/logs', authenticateToken, (req, res) => {
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
app.get('/api/apps/:name/env', authenticateToken, (req, res) => {
    const name = req.params.name;
    const apps = getApps();
    const appData = apps.find(a => a.name === name);
    if (!appData) return res.status(404).json({ error: 'App no encontrada' });
    res.json(appData.env || {});
});

app.post('/api/apps/:name/env', authenticateToken, (req, res) => {
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
app.get('/api/apps/:name/files', authenticateToken, (req, res) => {
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

app.get('/api/apps/:name/files/content', authenticateToken, (req, res) => {
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

app.post('/api/apps/:name/files/content', authenticateToken, (req, res) => {
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
app.get('/api/apps/:name/versions', authenticateToken, (req, res) => {
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

    try {
        // Stop current
        stopAppProcess(name);

        // Replace current with version
        if (fs.existsSync(appData.path)) {
            fs.rmSync(appData.path, { recursive: true, force: true });
        }
        fs.mkdirSync(appData.path, { recursive: true });
        fs.cpSync(version.path, appData.path, { recursive: true });

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

// --- HEALTH ENDPOINTS ---
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    const dbStatus = fs.existsSync(SQLITE_FILE) ? 'connected' : 'missing';
    const fsStatus = fs.existsSync(APPS_DIR) ? 'ok' : 'missing';
    const apps = getApps();
    res.json({ status: 'ok', uptime: Math.round(uptime), dbStatus, fsStatus, totalApps: apps.length });
});

app.get('/api/apps/:name/health', authenticateToken, async (req, res) => {
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
    apps.forEach(appData => {
        const name = appData.name;
        const start = Date.now();
        const reqOptions = { method: 'GET', host: '127.0.0.1', port: appData.port, path: '/', timeout: 3000 };
        const reqHealth = http.request(reqOptions, rres => {
            const ms = Date.now() - start;
            const status = rres.statusCode >= 200 && rres.statusCode < 400 ? 'healthy' : 'unhealthy';
            appData.health = { status, lastCheck: new Date().toISOString(), responseTime: ms };
            saveApps(apps);
            io.emit(`health:${name}`, appData.health);
        });
        reqHealth.on('error', () => {
            appData.health = { status: 'unhealthy', lastCheck: new Date().toISOString(), responseTime: null };
            saveApps(apps);
            io.emit(`health:${name}`, appData.health);
        });
        reqHealth.end();
    });
}, 60 * 1000);

// --- SERVER STARTUP ---
const init = () => {
    const apps = getApps();
    console.log(`[SYSTEM] MiniPaaS started. ${apps.length} apps loaded.`);
    apps.forEach(startAppProcess);
    setInterval(createBackup, 24 * 60 * 60 * 1000);
    setTimeout(createBackup, 5000);
};

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n>>> MINI PAAS running at http://localhost:${PORT}`);
    console.log(`>>> Base directory: ${BASE_DIR}`);
    init();
});