import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {
  detectFileTypeFromBuffer,
  assertFileIsPdf,
  assertFileIsImage
} from '../../src/utils/file-signatures.js';
import { authService } from '../../src/modules/auth/services/auth.service.js';
import { storageService } from '../../src/services/storage.service.js';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  UnsupportedFormatError,
  FileCorruptedError,
  FileEncryptedError
} from '../../src/utils/errors.js';
import {
  createSyntheticPdf,
  createSyntheticImage,
  createSyntheticCsv
} from '../fixtures/synthetic.js';

describe('Security, Utilities & Storage', () => {
  let samplePdf: Buffer;
  let samplePng: Buffer;
  let sampleJpg: Buffer;
  let sampleCsv: Buffer;

  beforeAll(async () => {
    samplePdf = await createSyntheticPdf(1);
    samplePng = await createSyntheticImage('png');
    sampleJpg = await createSyntheticImage('jpg');
    sampleCsv = createSyntheticCsv();
  });

  describe('File Signature & Magic Bytes Validation', () => {
    it('should detect PDF signature correctly', () => {
      const info = detectFileTypeFromBuffer(samplePdf);
      expect(info.mime).toBe('application/pdf');
      expect(info.extension).toBe('.pdf');
      expect(info.category).toBe('pdf');
      expect(() => assertFileIsPdf(samplePdf)).not.toThrow();
    });

    it('should detect PNG signature correctly', () => {
      const info = detectFileTypeFromBuffer(samplePng);
      expect(info.mime).toBe('image/png');
      expect(info.extension).toBe('.png');
      expect(info.category).toBe('image');
      expect(() => assertFileIsImage(samplePng)).not.toThrow();
    });

    it('should detect JPEG signature correctly', () => {
      const info = detectFileTypeFromBuffer(sampleJpg);
      expect(info.mime).toBe('image/jpeg');
      expect(info.extension).toBe('.jpg');
      expect(info.category).toBe('image');
      expect(() => assertFileIsImage(sampleJpg)).not.toThrow();
    });

    it('should detect CSV and text signatures correctly', () => {
      const info = detectFileTypeFromBuffer(sampleCsv);
      expect(info.mime).toBe('text/csv');
      expect(info.extension).toBe('.csv');
      expect(info.category).toBe('text');
    });

    it('should reject empty or tiny buffer (< 4 bytes)', () => {
      expect(() => detectFileTypeFromBuffer(Buffer.from('hi'))).toThrow(AppError);
    });

    it('should throw UnsupportedFormatError when non-PDF is asserted as PDF', () => {
      expect(() => assertFileIsPdf(samplePng)).toThrow(UnsupportedFormatError);
      expect(() => assertFileIsPdf(sampleCsv)).toThrow(UnsupportedFormatError);
    });

    it('should throw UnsupportedFormatError when non-Image is asserted as Image', () => {
      expect(() => assertFileIsImage(samplePdf)).toThrow(UnsupportedFormatError);
    });
  });

  describe('Authentication & Token Security', () => {
    it('should securely hash and verify passwords using bcrypt', async () => {
      const rawPassword = 'MySecretSecurePassword456!';
      const hash = await authService.hashPassword(rawPassword);

      expect(hash).not.toBe(rawPassword);
      expect(hash.startsWith('$2')).toBe(true);

      const isValid = await authService.verifyPassword(rawPassword, hash);
      expect(isValid).toBe(true);

      const isInvalid = await authService.verifyPassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('should generate and verify valid JWT tokens', () => {
      const user = { _id: '507f191e810c19729de860ea', email: 'test@example.com', role: 'user' };
      const tokens = authService.generateTokens(user);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      const decodedAccess = authService.verifyAccessToken(tokens.accessToken);
      expect(decodedAccess.sub).toBe(user._id);
      expect(decodedAccess.email).toBe(user.email);

      const decodedRefresh = authService.verifyRefreshToken(tokens.refreshToken);
      expect(decodedRefresh.sub).toBe(user._id);
    });

    it('should throw UnauthorizedError on invalid JWT token', () => {
      expect(() => authService.verifyAccessToken('invalid.token.here')).toThrow(UnauthorizedError);
      expect(() => authService.verifyRefreshToken('invalid.refresh.token')).toThrow(UnauthorizedError);
    });
  });

  describe('Storage Service & Lifecycle', () => {
    let savedFileId: string;
    let savedFilePath: string;

    it('should save a file and read it back correctly', async () => {
      const result = await storageService.saveTempFile('test-doc.pdf', samplePdf, 'application/pdf');
      savedFileId = result.fileId;
      savedFilePath = result.storedPath;

      expect(result.fileId).toBeDefined();
      expect(result.size).toBe(samplePdf.length);

      const exists = await storageService.fileExists(savedFilePath);
      expect(exists).toBe(true);

      const readBuffer = await storageService.getFileBuffer(savedFilePath);
      expect(readBuffer.length).toBe(samplePdf.length);
    });

    it('should save output files and allow verification', async () => {
      const outResult = await storageService.saveOutputFile('test-output.pdf', samplePdf, 'application/pdf');
      expect(outResult.fileId).toBeDefined();
      expect(await storageService.fileExists(outResult.storedPath)).toBe(true);
      await storageService.deleteFile(outResult.storedPath);
      expect(await storageService.fileExists(outResult.storedPath)).toBe(false);
    });

    it('should delete the saved temp file cleanly', async () => {
      await storageService.deleteFile(savedFilePath);
      const exists = await storageService.fileExists(savedFilePath);
      expect(exists).toBe(false);
    });
  });

  describe('Standardized Error Types & HTTP Status Mapping', () => {
    it('should verify AppError status codes and operational flags', () => {
      const valErr = new ValidationError('Invalid input');
      expect(valErr.statusCode).toBe(400);
      expect(valErr.isOperational).toBe(true);

      const unauthErr = new UnauthorizedError();
      expect(unauthErr.statusCode).toBe(401);

      const notFoundErr = new NotFoundError('Missing item');
      expect(notFoundErr.statusCode).toBe(404);

      const unsupportedErr = new UnsupportedFormatError('Unsupported file');
      expect(unsupportedErr.statusCode).toBe(415);

      const corruptedErr = new FileCorruptedError();
      expect(corruptedErr.statusCode).toBe(422);

      const encryptedErr = new FileEncryptedError();
      expect(encryptedErr.statusCode).toBe(422);
    });
  });
});
