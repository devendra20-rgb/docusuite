import pino, { Logger as PinoLogger } from 'pino';
import { config } from '../config/index.js';

const rawLogger: PinoLogger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : (config.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'secret',
      '*.password',
      'body.password',
      'body.token'
    ],
    censor: '[REDACTED]'
  },
  transport: config.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  } : undefined
});

export interface AppLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  fatal(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): AppLogger;
}

const createLoggerWrapper = (innerLogger: PinoLogger): AppLogger => {
  return {
    info(message: string, meta?: Record<string, unknown>) {
      if (meta) {
        innerLogger.info(meta, message);
      } else {
        innerLogger.info(message);
      }
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (meta) {
        innerLogger.warn(meta, message);
      } else {
        innerLogger.warn(message);
      }
    },
    error(message: string, meta?: Record<string, unknown>) {
      if (meta) {
        innerLogger.error(meta, message);
      } else {
        innerLogger.error(message);
      }
    },
    debug(message: string, meta?: Record<string, unknown>) {
      if (meta) {
        innerLogger.debug(meta, message);
      } else {
        innerLogger.debug(message);
      }
    },
    fatal(message: string, meta?: Record<string, unknown>) {
      if (meta) {
        innerLogger.fatal(meta, message);
      } else {
        innerLogger.fatal(message);
      }
    },
    child(bindings: Record<string, unknown>) {
      return createLoggerWrapper(innerLogger.child(bindings));
    }
  };
};

export const rawLoggerInstance = rawLogger;
export const logger: AppLogger = createLoggerWrapper(rawLogger);

export const createChildLogger = (moduleName: string): AppLogger => {
  return logger.child({ module: moduleName });
};
