import http from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { closeRedis } from './config/redis.js';
import { closeDocumentQueue } from './queues/document.queue.js';
import { storageService } from './services/storage.service.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  logger.info('Initializing DocuSuite Backend Server...', {
    env: config.NODE_ENV,
    port: config.PORT
  });

  // Ensure storage directories exist
  await storageService.ensureDirectories();

  // Connect Database (non-blocking for resilient local dev)
  try {
    await connectDatabase();
  } catch (err) {
    logger.warn('Database initialization warning', { err: (err as Error).message });
  }

  // Create Express application
  const app = createApp();
  const server = http.createServer(app);

  // Setup periodic temporary file cleanup (every hour)
  const cleanupInterval = setInterval(async () => {
    try {
      await storageService.cleanupExpiredFiles();
    } catch (err) {
      logger.warn('Periodic cleanup error', { err });
    }
  }, 60 * 60 * 1000);

  server.listen(config.PORT, () => {
    logger.info(`DocuSuite API Server is running on http://localhost:${config.PORT}`);
    logger.info(`Swagger API Documentation available at http://localhost:${config.PORT}/api/docs`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    clearInterval(cleanupInterval);

    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await closeDocumentQueue();
        await closeRedis();
        await disconnectDatabase();
        logger.info('All connections closed cleanly.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { err });
        process.exit(1);
      }
    });

    // Force close after 10 seconds if hanging
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.fatal('Fatal error during server bootstrap', { err });
  process.exit(1);
});
