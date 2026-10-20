import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('StorageService');

export interface StoredFileMetadata {
  fileId: string;
  originalName: string;
  filename: string;
  storedPath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface IStorageService {
  saveTempFile(originalName: string, buffer: Buffer, mimeType: string): Promise<StoredFileMetadata>;
  saveOutputFile(filename: string, buffer: Buffer, mimeType: string): Promise<StoredFileMetadata>;
  getFileBuffer(filePath: string): Promise<Buffer>;
  getFileStream(filePath: string): fsSync.ReadStream;
  deleteFile(filePath: string): Promise<void>;
  fileExists(filePath: string): Promise<boolean>;
  cleanupExpiredFiles(): Promise<number>;
  ensureDirectories(): Promise<void>;
}

export class LocalStorageService implements IStorageService {
  private tempDir: string;
  private outputDir: string;
  private rootDir: string;

  constructor() {
    this.tempDir = config.TEMP_DIR_ABSOLUTE;
    this.outputDir = config.OUTPUT_DIR_ABSOLUTE;
    this.rootDir = config.STORAGE_ROOT_ABSOLUTE;
  }

  public async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
      logger.info('Storage directories verified', { tempDir: this.tempDir, outputDir: this.outputDir });
    } catch (err) {
      logger.error('Failed to create storage directories', { err });
      throw new AppError('Failed to initialize storage subsystem', 500);
    }
  }

  private sanitizeFilename(name: string): string {
    return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private validatePath(filePath: string): string {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.rootDir)) {
      logger.warn('Path traversal attempt detected', { targetPath: filePath, resolved });
      throw new AppError('Access denied: Invalid file path', 403);
    }
    return resolved;
  }

  public async saveTempFile(originalName: string, buffer: Buffer, mimeType: string): Promise<StoredFileMetadata> {
    await this.ensureDirectories();
    const fileId = uuidv4();
    const sanitizedExt = path.extname(originalName) || '';
    const filename = `${fileId}${sanitizedExt}`;
    const storedPath = path.join(this.tempDir, filename);

    this.validatePath(storedPath);
    await fs.writeFile(storedPath, buffer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.FILE_RETENTION_HOURS * 60 * 60 * 1000);

    return {
      fileId,
      originalName: this.sanitizeFilename(originalName),
      filename,
      storedPath,
      mimeType,
      size: buffer.length,
      createdAt: now,
      expiresAt
    };
  }

  public async saveOutputFile(filename: string, buffer: Buffer, mimeType: string): Promise<StoredFileMetadata> {
    await this.ensureDirectories();
    const fileId = uuidv4();
    const sanitized = this.sanitizeFilename(filename);
    const storedFilename = `${fileId}-${sanitized}`;
    const storedPath = path.join(this.outputDir, storedFilename);

    this.validatePath(storedPath);
    await fs.writeFile(storedPath, buffer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.FILE_RETENTION_HOURS * 60 * 60 * 1000);

    return {
      fileId,
      originalName: sanitized,
      filename: storedFilename,
      storedPath,
      mimeType,
      size: buffer.length,
      createdAt: now,
      expiresAt
    };
  }

  public async getFileBuffer(filePath: string): Promise<Buffer> {
    const safePath = this.validatePath(filePath);
    if (!fsSync.existsSync(safePath)) {
      throw new AppError('File not found on storage', 404);
    }
    return fs.readFile(safePath);
  }

  public getFileStream(filePath: string): fsSync.ReadStream {
    const safePath = this.validatePath(filePath);
    if (!fsSync.existsSync(safePath)) {
      throw new AppError('File not found on storage', 404);
    }
    return fsSync.createReadStream(safePath);
  }

  public async deleteFile(filePath: string): Promise<void> {
    try {
      const safePath = this.validatePath(filePath);
      if (fsSync.existsSync(safePath)) {
        await fs.unlink(safePath);
        logger.debug('File deleted', { filePath: safePath });
      }
    } catch (err) {
      logger.warn('Failed to delete file', { filePath, err });
    }
  }

  public async fileExists(filePath: string): Promise<boolean> {
    try {
      const safePath = this.validatePath(filePath);
      return fsSync.existsSync(safePath);
    } catch {
      return false;
    }
  }

  public async cleanupExpiredFiles(): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();
    const maxAgeMs = config.FILE_RETENTION_HOURS * 60 * 60 * 1000;

    const cleanDirectory = async (dir: string) => {
      if (!fsSync.existsSync(dir)) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(dir, entry.name);
          const stats = await fs.stat(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.unlink(fullPath);
            deletedCount++;
          }
        }
      }
    };

    await cleanDirectory(this.tempDir);
    await cleanDirectory(this.outputDir);

    logger.info('Storage cleanup finished', { deletedFiles: deletedCount });
    return deletedCount;
  }
}

export const storageService = new LocalStorageService();
