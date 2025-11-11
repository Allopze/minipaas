const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const AUTH_MAX_FAILED_ATTEMPTS = parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS || '5', 10);
const AUTH_LOCKOUT_MS = parseInt(process.env.AUTH_LOCKOUT_MS || `${15 * 60 * 1000}`, 10);
const PASSWORD_MIN_LENGTH = parseInt(process.env.PASSWORD_MIN_LENGTH || '10', 10);
const PASSWORD_MAX_AGE_DAYS = parseInt(process.env.PASSWORD_MAX_AGE_DAYS || '0', 10);
const PASSWORD_REQUIRE_UPPER = process.env.PASSWORD_REQUIRE_UPPER !== 'false';
const PASSWORD_REQUIRE_LOWER = process.env.PASSWORD_REQUIRE_LOWER !== 'false';
const PASSWORD_REQUIRE_DIGIT = process.env.PASSWORD_REQUIRE_DIGIT !== 'false';
const PASSWORD_REQUIRE_SPECIAL = process.env.PASSWORD_REQUIRE_SPECIAL !== 'false';

class AuthManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.usersFilePath = path.join(dataDir, 'users.json');
    this.jwtSecret = this.loadOrCreateSecret();
    this.ensureDefaultUser();
  }

  loadOrCreateSecret() {
    const secretPath = path.join(this.dataDir, '.jwt_secret');
    
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf8');
    }
    
    const secret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretPath, secret, 'utf8');
    return secret;
  }

  async ensureDefaultUser() {
    if (!fs.existsSync(this.usersFilePath)) {
      const now = new Date().toISOString();
      const defaultUser = {
        username: 'admin',
        password: await bcrypt.hash('admin123', 10), // Cambiar en producción
        createdAt: now,
        passwordChangedAt: now,
        failedAttempts: 0,
        lockedUntil: null,
        forcePasswordChange: true,
        forceUsernameChange: true
      };
      
      fs.writeFileSync(
        this.usersFilePath,
        JSON.stringify({ users: [defaultUser] }, null, 2),
        'utf8'
      );
      
      console.log('🔐 Usuario por defecto creado: admin / admin123');
      console.log('⚠️  Cambia la contraseña en producción cuanto antes.');
    }
  }

  loadUsers() {
    try {
      const data = fs.readFileSync(this.usersFilePath, 'utf8');
      const { users } = JSON.parse(data);
      return (users || []).map(user => this.normalizeUserRecord(user));
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      return [];
    }
  }

  normalizeUserRecord(user) {
    const fallbackDate = user.updatedAt || user.createdAt || new Date().toISOString();
    return {
      ...user,
      failedAttempts: typeof user.failedAttempts === 'number' ? user.failedAttempts : 0,
      lockedUntil: user.lockedUntil || null,
      passwordChangedAt: user.passwordChangedAt || fallbackDate,
      forcePasswordChange: Boolean(user.forcePasswordChange),
      forceUsernameChange: typeof user.forceUsernameChange === 'boolean'
        ? user.forceUsernameChange
        : user.username === 'admin'
    };
  }

  saveUsers(users) {
    try {
      fs.writeFileSync(
        this.usersFilePath,
        JSON.stringify({ users }, null, 2),
        'utf8'
      );
      return true;
    } catch (error) {
      console.error('Error al guardar usuarios:', error);
      return false;
    }
  }

  findUser(username) {
    const users = this.loadUsers();
    const userIndex = users.findIndex(u => u.username === username);
    return {
      users,
      user: userIndex !== -1 ? users[userIndex] : null,
      userIndex
    };
  }

  async authenticate(username, password) {
    const { users, user, userIndex } = this.findUser(username);
    
    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    if (this.isUserLocked(user, users)) {
      return {
        success: false,
        error: 'Cuenta bloqueada temporalmente. Intenta más tarde.',
        lockedUntil: user.lockedUntil
      };
    }

    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      const { attemptsRemaining, lockedUntil } = this.registerFailedAttempt(users, userIndex);
      return {
        success: false,
        error: lockedUntil
          ? 'Cuenta bloqueada por múltiples intentos fallidos.'
          : 'Contraseña incorrecta',
        attemptsRemaining,
        lockedUntil
      };
    }

    this.resetFailedAttempts(users, userIndex);

    const passwordExpired = this.isPasswordExpired(user);
    if (passwordExpired && !user.forcePasswordChange) {
      users[userIndex].forcePasswordChange = true;
      this.saveUsers(users);
    }

    const requiresPasswordChange = Boolean(user.forcePasswordChange || passwordExpired);
    const requiresUsernameChange = Boolean(user.forceUsernameChange);

    const token = jwt.sign(
      { username: user.username },
      this.jwtSecret,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      token,
      user: {
        username: user.username,
        createdAt: user.createdAt
      },
      passwordExpired,
      actionsRequired: {
        password: requiresPasswordChange,
        username: requiresUsernameChange
      }
    };
  }

  registerFailedAttempt(users, index) {
    const user = users[index];
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    let attemptsSnapshot = user.failedAttempts;
    let lockedUntil = null;

    if (user.failedAttempts >= AUTH_MAX_FAILED_ATTEMPTS) {
      lockedUntil = Date.now() + AUTH_LOCKOUT_MS;
      user.lockedUntil = lockedUntil;
      user.failedAttempts = 0;
      attemptsSnapshot = AUTH_MAX_FAILED_ATTEMPTS;
    }

    this.saveUsers(users);

    return {
      attemptsRemaining: Math.max(AUTH_MAX_FAILED_ATTEMPTS - attemptsSnapshot, 0),
      lockedUntil
    };
  }

  resetFailedAttempts(users, index) {
    users[index].failedAttempts = 0;
    users[index].lockedUntil = null;
    this.saveUsers(users);
  }

  isUserLocked(user, users = null) {
    if (!user.lockedUntil) return false;
    if (Date.now() > user.lockedUntil) {
      user.lockedUntil = null;
      user.failedAttempts = 0;
      if (users) {
        this.saveUsers(users);
      } else {
        const allUsers = this.loadUsers().map(u => (u.username === user.username ? user : u));
        this.saveUsers(allUsers);
      }
      return false;
    }
    return true;
  }

  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return { valid: true, data: decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  validatePasswordPolicy(password) {
    const errors = [];

    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    }
    if (PASSWORD_REQUIRE_UPPER && !/[A-Z]/.test(password)) {
      errors.push('Debe incluir al menos una letra mayúscula.');
    }
    if (PASSWORD_REQUIRE_LOWER && !/[a-z]/.test(password)) {
      errors.push('Debe incluir al menos una letra minúscula.');
    }
    if (PASSWORD_REQUIRE_DIGIT && !/[0-9]/.test(password)) {
      errors.push('Debe incluir al menos un número.');
    }
    if (PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>_\-]/.test(password)) {
      errors.push('Debe incluir al menos un caracter especial.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  isPasswordExpired(user) {
    if (!PASSWORD_MAX_AGE_DAYS || !user.passwordChangedAt) {
      return false;
    }
    const maxAgeMs = PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - new Date(user.passwordChangedAt).getTime() > maxAgeMs;
  }

  async changePassword(username, oldPassword, newPassword) {
    const { users, user, userIndex } = this.findUser(username);
    
    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    let isValid = false;
    if (oldPassword) {
      try {
        isValid = await bcrypt.compare(oldPassword, user.password);
      } catch (e) {}
    }
    // En primer login, permite cambio aunque falle la verificación
    if (!isValid && !user.forcePasswordChange) {
      return { success: false, error: 'Contraseña actual incorrecta' };
    }

    if (oldPassword === newPassword) {
      return { success: false, error: 'La contraseña nueva no puede ser igual a la anterior' };
    }

    const policy = this.validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return { success: false, error: policy.errors.join(' ') };
    }

    users[userIndex].password = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();
    users[userIndex].updatedAt = now;
    users[userIndex].passwordChangedAt = now;
    users[userIndex].forcePasswordChange = false;
    users[userIndex].failedAttempts = 0;
    users[userIndex].lockedUntil = null;
    
    this.saveUsers(users);
    
    return { success: true, message: 'Contraseña actualizada' };
  }

  async changeUsername(currentUsername, newUsername) {
    const { users, user, userIndex } = this.findUser(currentUsername);
    
    if (!user) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    const existingUser = users.find(u => u.username === newUsername);
    if (existingUser) {
      return { success: false, error: 'El nombre de usuario ya existe' };
    }

    users[userIndex].username = newUsername;
    users[userIndex].updatedAt = new Date().toISOString();
    users[userIndex].forceUsernameChange = false;
    
    this.saveUsers(users);
    
    return { success: true, message: 'Nombre de usuario actualizado' };
  }

  getUserRecord(username) {
    const { user } = this.findUser(username);
    return user;
  }
}

function authMiddleware(authManager) {
  const publicPaths = ['/login', '/api/auth/login'];
  const credentialUpdateAllowed = ['/api/auth/change-password', '/api/auth/change-username', '/api/auth/logout'];

  return (req, res, next) => {
    if (publicPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'No autenticado' });
      }
      return res.redirect('/login');
    }

    const verification = authManager.verifyToken(token);
    
    if (!verification.valid) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'Token inválido' });
      }
      return res.redirect('/login');
    }

    const userRecord = authManager.getUserRecord(verification.data.username);
    if (!userRecord) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'Usuario inexistente' });
      }
      return res.redirect('/login');
    }

    const needsCredentialUpdate = userRecord.forcePasswordChange || userRecord.forceUsernameChange;
    if (needsCredentialUpdate) {
      if (req.path.startsWith('/api/')) {
        if (!credentialUpdateAllowed.includes(req.path)) {
          return res.status(403).json({
            ok: false,
            error: 'Debes actualizar tus credenciales para continuar.',
            code: 'CREDENTIAL_UPDATE_REQUIRED',
            actionsRequired: {
              password: Boolean(userRecord.forcePasswordChange),
              username: Boolean(userRecord.forceUsernameChange)
            }
          });
        }
      }
    }

    req.user = verification.data;
    next();
  };
}

module.exports = { AuthManager, authMiddleware };

