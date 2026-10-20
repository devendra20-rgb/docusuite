import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api'),

  JWT_SECRET: z.string().min(16).default('super-secret-jwt-key-replace-in-production-min-32-chars'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_SECRET: z.string().min(16).default('super-secret-refresh-key-replace-in-production-min-32'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),

  MONGODB_URI: z.string().default('mongodb://localhost:27017/docusuite'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('./storage'),
  TEMP_DIR: z.string().default('./storage/temp'),
  OUTPUT_DIR: z.string().default('./storage/outputs'),
  FILE_RETENTION_HOURS: z.coerce.number().default(24),
  CLEANUP_CRON_SCHEDULE: z.string().default('0 * * * *'),

  MAX_FILE_SIZE_BYTES: z.coerce.number().default(52428800), // 50MB
  MAX_FILES_PER_REQUEST: z.coerce.number().default(10),
  MAX_PAGES_PER_DOCUMENT: z.coerce.number().default(500),
  CONVERSION_TIMEOUT_MS: z.coerce.number().default(60000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  GUEST_DAILY_JOB_LIMIT: z.coerce.number().default(20),

  SOFFICE_PATH: z.string().optional().default(''),
  QPDF_PATH: z.string().optional().default(''),
  GS_PATH: z.string().optional().default('')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Environment validation error:', parsedEnv.error.format());
  throw new Error('Invalid environment configuration');
}

export const config = {
  ...parsedEnv.data,
  TEMP_DIR_ABSOLUTE: path.resolve(parsedEnv.data.TEMP_DIR),
  OUTPUT_DIR_ABSOLUTE: path.resolve(parsedEnv.data.OUTPUT_DIR),
  STORAGE_ROOT_ABSOLUTE: path.resolve(parsedEnv.data.STORAGE_LOCAL_ROOT)
};

export type Config = typeof config;
