import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { createChildLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const logger = createChildLogger('ErrorHandler');

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request input or parameters',
        details: err.flatten()
      }
    });
    return;
  }

  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    let code = 'UPLOAD_ERROR';

    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `File exceeds maximum allowed size of ${Math.round(config.MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB`;
      code = 'FILE_TOO_LARGE';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = `Too many files. Maximum allowed per request is ${config.MAX_FILES_PER_REQUEST}`;
      code = 'TOO_MANY_FILES';
    }

    res.status(400).json({
      success: false,
      error: {
        code,
        message,
        details: err.field
      }
    });
    return;
  }

  // Handle known operational AppErrors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Operational server error', { err: err.message, stack: err.stack });
    } else {
      logger.warn('Client request error', { code: err.code, message: err.message });
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
    return;
  }

  // Unhandled Programmer/System Errors
  logger.error('Unhandled internal server error', {
    message: err.message,
    stack: err.stack
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.NODE_ENV === 'production'
        ? 'An unexpected internal error occurred'
        : err.message
    }
  });
};
