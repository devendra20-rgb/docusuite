export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class FileCorruptedError extends AppError {
  constructor(message = 'File is corrupted or damaged and cannot be processed') {
    super(message, 422, 'FILE_CORRUPTED');
  }
}

export class FileEncryptedError extends AppError {
  constructor(message = 'PDF is password-protected. Provide the correct password to unlock.') {
    super(message, 422, 'FILE_ENCRYPTED');
  }
}

export class ConversionError extends AppError {
  constructor(message = 'Document conversion failed', details?: unknown) {
    super(message, 422, 'CONVERSION_FAILED', details);
  }
}

export class UnsupportedFormatError extends AppError {
  constructor(message = 'File format is unsupported for this operation') {
    super(message, 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
}

export class RateLimitExceededError extends AppError {
  constructor(message = 'Rate limit exceeded. Please try again later.') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}
