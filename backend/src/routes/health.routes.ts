import { Router, Request, Response } from 'express';
import { isDatabaseHealthy } from '../config/database.js';
import { isRedisHealthy } from '../config/redis.js';
import { libreOfficeAdapter } from '../adapters/converters/libreoffice.adapter.js';
import { storageService } from '../services/storage.service.js';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'docusuite-backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  const dbStatus = isDatabaseHealthy();
  const redisStatus = isRedisHealthy();
  const libreOfficeAvailable = await libreOfficeAdapter.isAvailable();
  const storageHealthy = await storageService.fileExists(storageService['tempDir']);

  const isReady = dbStatus || process.env.NODE_ENV !== 'production';

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    dependencies: {
      database: dbStatus ? 'connected' : 'disconnected',
      redis: redisStatus ? 'connected' : 'disconnected',
      storage: storageHealthy ? 'writable' : 'unavailable',
      libreOffice: libreOfficeAvailable ? 'available' : 'unavailable (native Office conversions disabled)'
    }
  });
});

export default router;
