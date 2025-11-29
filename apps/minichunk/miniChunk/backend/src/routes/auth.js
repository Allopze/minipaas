import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { db } from '../database/init.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

export const authRoutes = Router();

// Input validation middleware
const validateLogin = [
  body('username').trim().notEmpty().isLength({ min: 3, max: 50 }),
  body('password').notEmpty().isLength({ min: 6, max: 100 }),
];

const validatePassword = [
  body('currentPassword').notEmpty(),
  body('newPassword').notEmpty().isLength({ min: 6, max: 100 }),
];

const validateUsername = [
  body('username').trim().notEmpty().isLength({ min: 3, max: 50 }),
];

// Login
authRoutes.post('/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid username or password format' });
    }

    const { username, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
authRoutes.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, role, createdAt FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// Change password
authRoutes.post('/change-password', authMiddleware, validatePassword, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid password format' });
    }

    const { currentPassword, newPassword } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(newHash, req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error({ error: error.message, userId: req.user.id }, 'Change password error');
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Update profile (username)
authRoutes.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: 'El nombre de usuario debe tener al menos 3 caracteres' });
    }

    const sanitizedUsername = username.trim();

    // Check if username is already taken by another user
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(sanitizedUsername, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }

    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(sanitizedUsername, req.user.id);

    const updatedUser = db.prepare('SELECT id, username, role, createdAt FROM users WHERE id = ?').get(req.user.id);
    
    res.json(updatedUser);
  } catch (error) {
    logger.error({ error: error.message, userId: req.user.id }, 'Update profile error');
    res.status(500).json({ error: 'Failed to update profile' });
  }
});
