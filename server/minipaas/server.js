const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const AppManager = require('./services/AppManager');
const { AuthManager, authMiddleware } = require('./middleware/auth');
const { setupProxyMiddlewares } = require('./middleware/proxy');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 5050;
const HOST = '0.0.0.0';
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || '';
const allowedOrigins = rawAllowedOrigins
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => origin.length > 0);
const corsOptions = {
  origin: (origin, callback) => {
    if (!allowedOrigins.length) {
      return callback(null, true);
    }
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
};
const cookieSecure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
const csrfSafeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfProtection = (req, res, next) => {
  if (csrfSafeMethods.has(req.method)) {
    return next();
  }
  const csrfCookie = req.cookies?.csrfToken;
  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ ok: false, error: 'CSRF token inválido', code: 'CSRF_MISMATCH' });
  }
  next();
};

const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_WINDOW_MS || `${15 * 60 * 1000}`, 10),
  max: parseInt(process.env.AUTH_RATE_MAX || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos de autenticación. Intenta más tarde.' }
});

// Directorios
const APPS_DIR = path.join(__dirname, 'apps');
const DATA_DIR = path.join(__dirname, 'data');
const LOGS_DIR = path.join(__dirname, 'logs');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Middleware básico
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' }
}));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Inicializar managers
const appManager = new AppManager(APPS_DIR, DATA_DIR, LOGS_DIR);
const authManager = new AuthManager(DATA_DIR);

// Rutas públicas de autenticación (antes del middleware de auth)
app.use('/api/auth', authLimiter);

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos' });
    }

    const result = await authManager.authenticate(username, password);
    
    if (result.success) {
      const csrfToken = crypto.randomBytes(48).toString('hex');
      const cookieConfig = {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'strict',
        secure: cookieSecure
      };

      res.cookie('token', result.token, {
        ...cookieConfig,
        httpOnly: true
      });

      res.cookie('csrfToken', csrfToken, {
        ...cookieConfig,
        httpOnly: false
      });
      
      res.json({
        ok: true,
        user: result.user,
        csrfToken,
        passwordExpired: result.passwordExpired,
        actionsRequired: result.actionsRequired
      });
    } else {
      res.status(401).json({ ok: false, error: result.error, attemptsRemaining: result.attemptsRemaining, lockedUntil: result.lockedUntil });
    }
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/auth/logout', authMiddleware(authManager), csrfProtection, (req, res) => {
  res.clearCookie('token');
  res.clearCookie('csrfToken');
  res.json({ ok: true, message: 'Sesión cerrada' });
});

app.post('/api/auth/change-password', authMiddleware(authManager), async (req, res) => {
  try {
    const { currentPassword, oldPassword, newPassword } = req.body;
    const username = req.user.username;
    
    // Aceptar tanto currentPassword como oldPassword por compatibilidad
    const password = currentPassword || oldPassword;
    
    const result = await authManager.changePassword(username, password, newPassword);
    
    if (result.success) {
      res.json({ ok: true, message: result.message });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/auth/change-username', authMiddleware(authManager), async (req, res) => {
  try {
    const { newUsername, currentPassword } = req.body;
    const currentUsername = req.user.username;

    if (!newUsername || !currentPassword) {
      return res.status(400).json({ ok: false, error: 'Faltan datos requeridos' });
    }

    // Validar formato del nuevo usuario
    if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
      return res.status(400).json({
        ok: false,
        error: 'El usuario solo puede contener letras, numeros, guiones y guiones bajos'
      });
    }

    if (newUsername.length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'El usuario debe tener al menos 3 caracteres'
      });
    }

    // Verificar contrasena actual, excepto en primer login forzado
    const userRecord = authManager.getUserRecord(currentUsername);
    if (!userRecord || !userRecord.forceUsernameChange) {
      const auth = await authManager.authenticate(currentUsername, currentPassword);
      if (!auth.success) {
        return res.status(401).json({ ok: false, error: 'Contrasena incorrecta' });
      }
    }

    // Cambiar nombre de usuario
    const result = await authManager.changeUsername(currentUsername, newUsername);

    if (result.success) {
      // Invalidar token actual
      res.clearCookie('token');
      res.json({ ok: true, message: result.message });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Página de login (pública)
app.get('/login', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

// Aplicar middleware de autenticación a todas las demás rutas
app.use(authMiddleware(authManager));
app.use(csrfProtection);

// Archivos estáticos del panel (protegidos)
app.use(express.static(PUBLIC_DIR));

// Configurar proxies para apps con publicPath
setupProxyMiddlewares(app, appManager);

// Rutas API
const apiRoutes = require('./routes/api')(appManager);
app.use('/api', apiRoutes);

// Servir apps estáticas
app.use('/apps/:name', (req, res, next) => {
  const appName = req.params.name;
  const appRecord = appManager.getApp(appName);
  
  if (!appRecord) {
    return res.status(404).send('App no encontrada');
  }

  if (appRecord.type === 'static') {
    express.static(appRecord.path)(req, res, next);
  } else {
    // Para apps Node.js, deberían estar corriendo en su propio puerto
    res.send(`Esta es una app Node.js. Accede a ella en http://${req.hostname}:${appRecord.port}`);
  }
});

// Ruta principal - panel de administración
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Manejador de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: err.message });
});

// Iniciar servidor
app.listen(PORT, HOST, async () => {
  console.log('='.repeat(50));
  console.log('🚀 MiniPaaS iniciado');
  console.log('='.repeat(50));
  console.log(`📡 Panel de administración: http://${HOST}:${PORT}`);
  console.log(`📂 Directorio de apps: ${APPS_DIR}`);
  console.log(`💾 Directorio de datos: ${DATA_DIR}`);
  console.log(`📝 Directorio de logs: ${LOGS_DIR}`);
  console.log('='.repeat(50));
  
  // Restaurar apps que estaban corriendo
  console.log('Restaurando apps...');
  await appManager.restoreApps();
  console.log('✅ Sistema listo');
  console.log('='.repeat(50));
});

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('\n⏳ Deteniendo MiniPaaS...');
  
  // Detener healthcheck
  appManager.stopHealthCheck();
  
  // Detener todas las apps
  const apps = appManager.listApps();
  for (const app of apps) {
    if (app.status === 'running') {
      try {
        await appManager.stopApp(app.name);
        console.log(`✓ App ${app.name} detenida`);
      } catch (error) {
        console.error(`✗ Error al detener ${app.name}:`, error.message);
      }
    }
  }
  
  console.log('👋 MiniPaaS detenido');
  process.exit(0);
});

