import { createDocumentWorker } from './document.worker.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { closeRedis } from '../config/redis.js';
import { storageService } from '../services/storage.service.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('WorkerMain');

async function main() {
  logger.info('Starting DocuSuite Background Processing Worker...');

  await storageService.ensureDirectories();
  await connectDatabase();

  const worker = createDocumentWorker();
  logger.info('DocuSuite BullMQ Worker is running and listening for jobs.');

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down worker gracefully...`);
    try {
      await worker.close();
      await disconnectDatabase();
      await closeRedis();
      logger.info('Worker shutdown complete.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during worker shutdown', { err });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Worker failed to start', { err });
  process.exit(1);
});
