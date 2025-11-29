import { Router } from 'express';
import si from 'systeminformation';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

export const metricsRoutes = Router();

// Get host metrics
metricsRoutes.get('/', authMiddleware, async (req, res) => {
  try {
    const [cpu, mem, disk] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize()
    ]);

    // Get main disk (usually first or largest)
    const mainDisk = disk.reduce((prev, current) => 
      (current.size > prev.size) ? current : prev
    , disk[0]);

    res.json({
      cpu: {
        usage: Math.round(cpu.currentLoad * 100) / 100,
        cores: cpu.cpus ? cpu.cpus.length : 1
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: Math.round((mem.used / mem.total) * 10000) / 100
      },
      disk: {
        total: mainDisk.size,
        used: mainDisk.used,
        free: mainDisk.available,
        usedPercent: Math.round(mainDisk.use * 100) / 100,
        mount: mainDisk.mount
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Metrics error');
    res.status(500).json({ error: 'Failed to get system metrics' });
  }
});
