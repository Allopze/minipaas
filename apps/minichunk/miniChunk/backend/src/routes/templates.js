import { Router } from 'express';
import { db } from '../database/init.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { 
  ServerTypes, 
  getVersionsForType, 
  getDefaultJarName, 
  getDefaultJvmArgs 
} from '../services/jarDownloadService.js';

export const templateRoutes = Router();

// Get all server types available
templateRoutes.get('/types', authMiddleware, (req, res) => {
  const types = [
    { id: ServerTypes.VANILLA, name: 'Vanilla', description: 'Servidor oficial de Mojang' },
    { id: ServerTypes.PAPER, name: 'Paper', description: 'Servidor optimizado para rendimiento' },
    { id: ServerTypes.PURPUR, name: 'Purpur', description: 'Fork de Paper con más opciones' },
    { id: ServerTypes.FABRIC, name: 'Fabric', description: 'Servidor con soporte para mods Fabric' }
  ];
  res.json(types);
});

// Get versions for a specific server type
templateRoutes.get('/versions/:type', authMiddleware, async (req, res) => {
  try {
    const { type } = req.params;
    const versions = await getVersionsForType(type);
    res.json(versions);
  } catch (error) {
    logger.error({ error: error.message, type: req.params.type }, 'Error fetching versions');
    res.status(400).json({ error: error.message });
  }
});

// Get default settings for a server type
templateRoutes.get('/defaults/:type', authMiddleware, (req, res) => {
  try {
    const { type } = req.params;
    res.json({
      jarFileName: getDefaultJarName(type),
      jvmArgs: getDefaultJvmArgs(type),
      defaultMemory: type === 'paper' || type === 'purpur' ? 4096 : 2048
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all templates (legacy - for backward compatibility)
templateRoutes.get('/', authMiddleware, (req, res) => {
  const templates = db.prepare('SELECT * FROM templates ORDER BY type, version DESC').all();
  res.json(templates);
});

// Get template by ID (legacy)
templateRoutes.get('/:id', authMiddleware, (req, res) => {
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});
