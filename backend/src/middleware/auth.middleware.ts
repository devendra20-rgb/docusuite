import { Request, Response, NextFunction } from 'express';
import { authService } from '../modules/auth/services/auth.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      isGuest?: boolean;
      guestIp?: string;
    }
  }
}

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication token missing or invalid format');
  }

  const token = authHeader.substring(7);
  const payload = authService.verifyAccessToken(token);

  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role
  };
  req.isGuest = false;

  next();
};

export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const payload = authService.verifyAccessToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role
      };
      req.isGuest = false;
      return next();
    } catch {
      // If token invalid, treat as guest rather than erroring immediately on guest-permitted endpoints
    }
  }

  req.isGuest = true;
  req.guestIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  next();
};
