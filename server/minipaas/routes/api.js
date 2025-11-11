const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAX_UPLOAD_SIZE = Number(process.env.MAX_UPLOAD_SIZE_BYTES) || 100 * 1024 * 1024; // 100 MB por defecto
const MAX_UPLOAD_SIZE_MB = Math.round(MAX_UPLOAD_SIZE / (1024 * 1024));
const ALLOWED_ZIP_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
  'application/octet-stream'
]);

const router = express.Router();

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(os.tmpdir(), 'minipaas-uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isZipExt = ext === '.zip';
    const mime = (file.mimetype || '').toLowerCase();
    if (isZipExt && (!mime || ALLOWED_ZIP_MIMES.has(mime))) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .zip válidos'));
    }
  }
});

module.exports = (appManager) => {
  /**
   * GET /api/apps - Lista todas las apps
   */
  router.get('/apps', (req, res) => {
    try {
      const apps = appManager.listApps();
      res.json({ ok: true, apps });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/apps/:name - Obtiene una app específica
   */
  router.get('/apps/:name', (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }
      res.json({ ok: true, app });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/apps - Despliega una nueva app
   */
  router.post('/apps', (req, res) => {
    upload.single('zipfile')(req, res, async (err) => {
      const cleanupTemp = () => {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      };

      if (err) {
        let message = err.message;
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          message = `Archivo demasiado grande. Límite: ${MAX_UPLOAD_SIZE_MB} MB`;
        }
        return res.status(400).json({ ok: false, error: message });
      }

      try {
        if (!req.file) {
          return res.status(400).json({ ok: false, error: 'No se proporcionó archivo ZIP' });
        }

        const appName = req.body.name;
        const appType = req.body.type || 'auto'; // auto, nodejs, static, storage
        const publicPath = (req.body.publicPath || '').trim();
        const startCommand = (req.body.startCommand || '').trim();

        if (!appName) {
          cleanupTemp();
          return res.status(400).json({ ok: false, error: 'No se proporcionó nombre de la app' });
        }

        // Validar nombre
        if (!/^[a-zA-Z0-9_\-]+$/.test(appName)) {
          cleanupTemp();
          return res.status(400).json({ ok: false, error: 'El nombre solo puede contener letras, números, guiones y guiones bajos' });
        }

        if (publicPath && !appManager.isPublicPathValid(publicPath)) {
          cleanupTemp();
          return res.status(400).json({ ok: false, error: 'La ruta pública es inválida o está reservada' });
        }

        const app = await appManager.deployApp(appName, req.file.path, appType, publicPath, startCommand);

        cleanupTemp();

        res.json({ 
          ok: true, 
          message: 'App desplegada exitosamente',
          app: app
        });
      } catch (error) {
        console.error('Error al desplegar app:', error);
        cleanupTemp();
        res.status(500).json({ ok: false, error: error.message });
      }
    });
  });

  /**
   * POST /api/apps/:name/restart - Reinicia una app
   */
  router.post('/apps/:name/restart', async (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      await appManager.restartApp(req.params.name);
      
      res.json({ 
        ok: true, 
        message: 'App reiniciada exitosamente'
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/apps/:name/stop - Detiene una app
   */
  router.post('/apps/:name/stop', async (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      await appManager.stopApp(req.params.name);
      
      res.json({ 
        ok: true, 
        message: 'App detenida exitosamente'
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/apps/:name/start - Inicia una app
   */
  router.post('/apps/:name/start', async (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      await appManager.startApp(req.params.name);
      
      res.json({ 
        ok: true, 
        message: 'App iniciada exitosamente'
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/apps/:name/pause - Pausa una app
   */
  router.post('/apps/:name/pause', async (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      await appManager.pauseApp(req.params.name);
      
      res.json({ 
        ok: true, 
        message: 'App pausada exitosamente'
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/apps/:name/resume - Reanuda una app pausada
   */
  router.post('/apps/:name/resume', async (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      await appManager.resumeApp(req.params.name);
      
      res.json({ 
        ok: true, 
        message: 'App reanudada exitosamente'
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * DELETE /api/apps/:name - Elimina una app
   */
  router.delete('/apps/:name', async (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      await appManager.deleteApp(req.params.name);
      
      res.json({ 
        ok: true, 
        message: 'App eliminada exitosamente'
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/apps/:name/logs - Obtiene los logs de una app
   */
  router.get('/apps/:name/logs', (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      const logs = appManager.getAppLog(req.params.name);
      
      res.json({ 
        ok: true, 
        logs: logs
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/ports/next - Debug: obtiene el siguiente puerto disponible
   */
  router.get('/ports/next', async (req, res) => {
    try {
      const port = await appManager.portAllocator.findNextAvailablePort();
      res.json({ ok: true, port });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/system/info - Información del sistema
   */
  router.get('/system/info', (req, res) => {
    try {
      const networkInterfaces = os.networkInterfaces();
      const ips = [];
      
      for (const name in networkInterfaces) {
        for (const iface of networkInterfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            ips.push(iface.address);
          }
        }
      }

      const stats = appManager.getSystemStats();

      res.json({
        ok: true,
        info: {
          hostname: os.hostname(),
          platform: os.platform(),
          ips: ips,
          uptime: os.uptime(),
          totalApps: appManager.listApps().length,
          stats: stats
        }
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/system/stats - Estadísticas agregadas del sistema
   */
  router.get('/system/stats', (req, res) => {
    try {
      const stats = appManager.getSystemStats();
      res.json({ ok: true, stats });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/apps/:name/envs - Obtiene variables de entorno de una app
   */
  router.get('/apps/:name/envs', (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      const envVars = appManager.envManager.getEnvVars(req.params.name);
      res.json({ ok: true, envVars });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * PUT /api/apps/:name/envs - Actualiza variables de entorno de una app
   */
  router.put('/apps/:name/envs', express.json(), (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      const { envVars } = req.body;
      if (!envVars || typeof envVars !== 'object') {
        return res.status(400).json({ ok: false, error: 'Variables de entorno inválidas' });
      }

      appManager.envManager.setEnvVars(req.params.name, envVars);
      res.json({ ok: true, message: 'Variables de entorno actualizadas' });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/apps/:name/backups - Lista los backups de una app
   */
  router.get('/apps/:name/backups', (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      const backups = appManager.backupManager.listBackups(req.params.name);
      res.json({ ok: true, backups });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/apps/:name/restore - Restaura una app desde un backup
   */
  router.post('/apps/:name/restore', express.json(), async (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      const { backupFilename } = req.body;
      if (!backupFilename) {
        return res.status(400).json({ ok: false, error: 'No se especificó el backup' });
      }

      await appManager.restoreFromBackup(req.params.name, backupFilename);
      res.json({ ok: true, message: 'App restaurada desde backup' });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * DELETE /api/apps/:name/backups/:filename - Elimina un backup específico
   */
  router.delete('/apps/:name/backups/:filename', (req, res) => {
    try {
      const result = appManager.backupManager.deleteBackup(req.params.name, req.params.filename);
      if (result.success) {
        res.json({ ok: true, message: 'Backup eliminado' });
      } else {
        res.status(404).json({ ok: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/config/export - Exporta la configuración completa
   */
  router.get('/config/export', (req, res) => {
    try {
      const config = appManager.exportConfiguration();
      res.json({ ok: true, config });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/config/import - Importa configuración
   */
  router.post('/config/import', express.json(), async (req, res) => {
    try {
      const { config } = req.body;
      if (!config) {
        return res.status(400).json({ ok: false, error: 'No se proporcionó configuración' });
      }

      const results = await appManager.importConfiguration(config);
      res.json({ ok: true, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/apps/:name/logs/download - Descarga el log completo
   */
  router.get('/apps/:name/logs/download', (req, res) => {
    try {
      const app = appManager.getApp(req.params.name);
      if (!app) {
        return res.status(404).json({ ok: false, error: 'App no encontrada' });
      }

      const logs = appManager.getFullAppLog(req.params.name);
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.log"`);
      res.send(logs);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
};
