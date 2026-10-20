import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { jobService } from '../../jobs/services/job.service.js';
import { ValidationError } from '../../../utils/errors.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

export class AuthController {
  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid registration input', parsed.error.format());
      }

      const result = await authService.register(
        parsed.data.email,
        parsed.data.password,
        parsed.data.name
      );

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  };

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid login credentials format', parsed.error.format());
      }

      const result = await authService.login(parsed.data.email, parsed.data.password);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  };

  public refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Refresh token required');
      }

      const payload = authService.verifyRefreshToken(parsed.data.refreshToken);
      const tokens = authService.generateTokens({
        _id: payload.sub,
        email: payload.email,
        role: payload.role
      });

      res.status(200).json({
        success: true,
        data: { tokens }
      });
    } catch (err) {
      next(err);
    }
  };

  public getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('Authentication required');
      }
      const profile = await authService.getProfile(req.user.id);
      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (err) {
      next(err);
    }
  };

  public getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('Authentication required');
      }
      const limit = Number(req.query.limit) || 20;
      const history = await jobService.getUserJobHistory(req.user.id, limit);
      res.status(200).json({
        success: true,
        data: history
      });
    } catch (err) {
      next(err);
    }
  };
}

export const authController = new AuthController();
