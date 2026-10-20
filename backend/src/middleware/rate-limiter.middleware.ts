import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { RateLimitExceededError } from '../utils/errors.js';

export const standardRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new RateLimitExceededError('Too many requests from this IP. Please try again later.'));
  }
});

export const guestProcessingLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: config.GUEST_DAILY_JOB_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.isGuest, // Only apply to guest requests
  handler: (_req, _res, next) => {
    next(
      new RateLimitExceededError(
        `Guest daily limit of ${config.GUEST_DAILY_JOB_LIMIT} document operations reached. Please create a free account to continue processing documents.`
      )
    );
  }
});
