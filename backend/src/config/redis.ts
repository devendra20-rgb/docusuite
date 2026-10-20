import { Redis } from 'ioredis';
import { config } from './index.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('Redis');

let redisClient: Redis | null = null;
let isHealthy = false;

export const getRedisClient = (): Redis => {
  if (redisClient) {
    return redisClient;
  }

  const redisOptions = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 500, 5000);
      return delay;
    }
  };

  redisClient = new Redis(redisOptions);

  redisClient.on('connect', () => {
    isHealthy = true;
    logger.info('Redis client connected', { host: config.REDIS_HOST, port: config.REDIS_PORT });
  });

  redisClient.on('error', (err) => {
    isHealthy = false;
    logger.warn('Redis error', { err: err.message });
  });

  redisClient.on('close', () => {
    isHealthy = false;
    logger.warn('Redis connection closed');
  });

  return redisClient;
};

export const isRedisHealthy = (): boolean => {
  return isHealthy;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isHealthy = false;
    logger.info('Redis client disconnected cleanly');
  }
};
