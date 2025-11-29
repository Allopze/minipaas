import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/init.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import logger from '../utils/logger.js';

export const userRoutes = Router();

// Get all users (admin only)
userRoutes.get('/', authMiddleware, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, username, role, createdAt FROM users').all();
  res.json(users);
});

// Create user (admin only)
userRoutes.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (role && !['ADMIN', 'HELPER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    db.prepare(`
      INSERT INTO users (id, username, passwordHash, role)
      VALUES (?, ?, ?, ?)
    `).run(id, username, passwordHash, role || 'HELPER');

    res.status(201).json({
      id,
      username,
      role: role || 'HELPER'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Create user error');
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (admin only)
userRoutes.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (username && username !== user.username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
      if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    if (role && !['ADMIN', 'HELPER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      db.prepare(`
        UPDATE users SET username = ?, passwordHash = ?, role = ? WHERE id = ?
      `).run(username || user.username, passwordHash, role || user.role, id);
    } else {
      db.prepare(`
        UPDATE users SET username = ?, role = ? WHERE id = ?
      `).run(username || user.username, role || user.role, id);
    }

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    logger.error({ error: error.message, userId: id }, 'Update user error');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
userRoutes.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error({ error: error.message, userId: id }, 'Delete user error');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});
