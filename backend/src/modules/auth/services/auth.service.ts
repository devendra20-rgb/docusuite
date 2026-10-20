import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel, IUser } from '../models/user.model.js';
import { config } from '../../../config/index.js';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError
} from '../../../utils/errors.js';
import { isDatabaseHealthy } from '../../../config/database.js';

// In-memory user store for test or offline environments
const inMemoryUsers = new Map<string, IUser>();

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class AuthService {
  public async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  public generateTokens(user: { _id: string | unknown; email: string; role: string }): AuthTokens {
    const payload = {
      sub: String(user._id),
      email: user.email,
      role: user.role
    };

    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as any
    });

    const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as any
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: config.JWT_EXPIRES_IN
    };
  }

  public verifyAccessToken(token: string): { sub: string; email: string; role: string } {
    try {
      return jwt.verify(token, config.JWT_SECRET) as { sub: string; email: string; role: string };
    } catch {
      throw new UnauthorizedError('Invalid or expired authentication token');
    }
  }

  public verifyRefreshToken(token: string): { sub: string; email: string; role: string } {
    try {
      return jwt.verify(token, config.JWT_REFRESH_SECRET) as { sub: string; email: string; role: string };
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  public async register(email: string, password: string, name?: string): Promise<{ user: Partial<IUser>; tokens: AuthTokens }> {
    const normalizedEmail = email.trim().toLowerCase();

    if (isDatabaseHealthy()) {
      const existing = await UserModel.findOne({ email: normalizedEmail });
      if (existing) {
        throw new ValidationError('Email is already registered');
      }

      const passwordHash = await this.hashPassword(password);
      const user = await UserModel.create({
        email: normalizedEmail,
        passwordHash,
        name: name?.trim()
      });

      const tokens = this.generateTokens(user);
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt
        },
        tokens
      };
    }

    // In-memory fallback
    if (inMemoryUsers.has(normalizedEmail)) {
      throw new ValidationError('Email is already registered');
    }

    const passwordHash = await this.hashPassword(password);
    const mockId = Math.random().toString(36).substring(2, 12);
    const mockUser = {
      _id: mockId,
      email: normalizedEmail,
      passwordHash,
      name: name?.trim(),
      role: 'user' as const,
      dailyJobsUsed: 0,
      lastJobReset: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as IUser;

    inMemoryUsers.set(normalizedEmail, mockUser);
    const tokens = this.generateTokens(mockUser);

    return {
      user: {
        _id: mockId as any,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        createdAt: mockUser.createdAt
      },
      tokens
    };
  }

  public async login(email: string, password: string): Promise<{ user: Partial<IUser>; tokens: AuthTokens }> {
    const normalizedEmail = email.trim().toLowerCase();
    let user: IUser | null = null;

    if (isDatabaseHealthy()) {
      user = await UserModel.findOne({ email: normalizedEmail });
    } else {
      user = inMemoryUsers.get(normalizedEmail) || null;
    }

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await this.verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokens = this.generateTokens(user);

    return {
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      },
      tokens
    };
  }

  public async getProfile(userId: string): Promise<Partial<IUser>> {
    let user: IUser | null = null;
    if (isDatabaseHealthy()) {
      user = await UserModel.findById(userId);
    } else {
      user = Array.from(inMemoryUsers.values()).find((u) => String(u._id) === userId) || null;
    }

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      dailyJobsUsed: user.dailyJobsUsed,
      createdAt: user.createdAt
    };
  }
}

export const authService = new AuthService();
