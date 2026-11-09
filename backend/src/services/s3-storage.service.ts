import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  S3ClientConfig
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorageService, StoredFileMetadata } from './storage.interface.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('S3StorageService');

export class S3StorageService implements IStorageService {
  public readonly provider = 's3' as const;
  private s3Client: S3Client;
  private bucket: string;
  private prefix: string;
  public readonly tempDir: string;
  public readonly outputDir: string;

  constructor() {
    this.bucket = config.AWS_S3_BUCKET;
    this.prefix = config.AWS_S3_PREFIX_NORMALIZED || 'docusuite/';
    this.tempDir = config.TEMP_DIR_ABSOLUTE;
    this.outputDir = config.OUTPUT_DIR_ABSOLUTE;

    const clientConfig: S3ClientConfig = {
      region: config.AWS_REGION || 'us-east-1'
    };

    if (config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY) {
      clientConfig.credentials = {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY
      };
    }

    if (config.AWS_S3_ENDPOINT) {
      clientConfig.endpoint = config.AWS_S3_ENDPOINT;
    }

    if (config.AWS_S3_FORCE_PATH_STYLE) {
      clientConfig.forcePathStyle = true;
    }

    this.s3Client = new S3Client(clientConfig);

    logger.info('S3StorageService initialized', {
      bucket: this.bucket,
      region: config.AWS_REGION,
      prefix: this.prefix,
      hasEndpoint: Boolean(config.AWS_S3_ENDPOINT)
    });
  }

  public getTempDir(): string {
    return this.tempDir;
  }

  public getOutputDir(): string {
    return this.outputDir;
  }

  public async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (err) {
      logger.error('Failed to create local scratch directories for S3 adapter', { err });
    }
  }

  private sanitizeFilename(name: string): string {
    return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Normalizes and validates an S3 key to ensure it is strictly confined within AWS_S3_PREFIX
   * and prevents path traversal (e.g., '..').
   */
  public validateKey(keyOrPath: string): string {
    const rawKey = keyOrPath.replace(/\\/g, '/').replace(/^\/+/, '');

    // Check for directory traversal attempts
    if (rawKey.includes('..') || rawKey.includes('\0')) {
      logger.warn('Path traversal attempt in S3 key', { keyOrPath, rawKey });
      throw new AppError('Access denied: Invalid object key', 403);
    }

    // If key starts with the configured prefix, verify and return
    if (rawKey.startsWith(this.prefix)) {
      return rawKey;
    }

    // If relative path without prefix (e.g. "temp/uuid.pdf" or "outputs/uuid-file.pdf"), attach prefix
    if (rawKey.startsWith('temp/') || rawKey.startsWith('outputs/')) {
      return `${this.prefix}${rawKey}`;
    }

    // If bare filename, route to temp/ by default
    return `${this.prefix}temp/${rawKey}`;
  }

  public async saveTempFile(originalName: string, buffer: Buffer, mimeType: string): Promise<StoredFileMetadata> {
    await this.ensureDirectories();
    const fileId = uuidv4();
    const sanitizedExt = path.extname(originalName) || '';
    const sanitizedName = this.sanitizeFilename(originalName);
    const filename = `${fileId}${sanitizedExt}`;
    const key = `${this.prefix}temp/${filename}`;

    const validatedKey = this.validateKey(key);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: validatedKey,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
        Metadata: {
          fileid: fileId,
          originalname: encodeURIComponent(sanitizedName)
        }
      })
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.FILE_RETENTION_HOURS * 60 * 60 * 1000);

    return {
      fileId,
      originalName: sanitizedName,
      filename,
      storedPath: validatedKey,
      mimeType,
      size: buffer.length,
      createdAt: now,
      expiresAt,
      provider: 's3',
      s3Key: validatedKey,
      s3Bucket: this.bucket
    };
  }

  public async saveOutputFile(filename: string, buffer: Buffer, mimeType: string): Promise<StoredFileMetadata> {
    await this.ensureDirectories();
    const fileId = uuidv4();
    const sanitized = this.sanitizeFilename(filename);
    const storedFilename = `${fileId}-${sanitized}`;
    const key = `${this.prefix}outputs/${storedFilename}`;

    const validatedKey = this.validateKey(key);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: validatedKey,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
        Metadata: {
          fileid: fileId,
          originalname: encodeURIComponent(sanitized)
        }
      })
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.FILE_RETENTION_HOURS * 60 * 60 * 1000);

    return {
      fileId,
      originalName: sanitized,
      filename: storedFilename,
      storedPath: validatedKey,
      mimeType,
      size: buffer.length,
      createdAt: now,
      expiresAt,
      provider: 's3',
      s3Key: validatedKey,
      s3Bucket: this.bucket
    };
  }

  public async getFileBuffer(keyOrPath: string): Promise<Buffer> {
    // Backward compatibility: If the file exists on the local filesystem, read it directly
    if (fsSync.existsSync(keyOrPath)) {
      return fs.readFile(keyOrPath);
    }

    const key = this.validateKey(keyOrPath);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      const response = await this.s3Client.send(command);
      if (!response.Body) {
        throw new AppError('File content is empty or unavailable on S3', 404);
      }

      const stream = response.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      for await (const chunk of stream as any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new AppError('File not found on storage', 404);
      }
      logger.error('Failed to retrieve S3 file buffer', { key, err: err.message });
      throw new AppError(`Storage retrieval failed: ${err.message}`, 500);
    }
  }

  public async getFileStream(keyOrPath: string): Promise<NodeJS.ReadableStream> {
    // Backward compatibility: If the file exists on the local filesystem, stream it directly
    if (fsSync.existsSync(keyOrPath)) {
      return fsSync.createReadStream(keyOrPath);
    }

    const key = this.validateKey(keyOrPath);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      const response = await this.s3Client.send(command);
      if (!response.Body) {
        throw new AppError('File content is empty or unavailable on S3', 404);
      }
      return response.Body as NodeJS.ReadableStream;
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new AppError('File not found on storage', 404);
      }
      logger.error('Failed to retrieve S3 file stream', { key, err: err.message });
      throw new AppError(`Storage stream failed: ${err.message}`, 500);
    }
  }

  public async deleteFile(keyOrPath: string): Promise<void> {
    // Backward compatibility: If local file exists, remove it
    if (fsSync.existsSync(keyOrPath)) {
      try {
        await fs.unlink(keyOrPath);
        return;
      } catch {
        // Fall through to try S3 if needed
      }
    }

    try {
      const key = this.validateKey(keyOrPath);
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      await this.s3Client.send(command);
      logger.debug('S3 object deleted', { key });
    } catch (err: any) {
      logger.warn('Failed to delete S3 file', { keyOrPath, err: err.message });
    }
  }

  public async fileExists(keyOrPath: string): Promise<boolean> {
    // Backward compatibility: Check local disk first
    if (fsSync.existsSync(keyOrPath)) {
      return true;
    }

    try {
      const key = this.validateKey(keyOrPath);
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      await this.s3Client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      return false;
    }
  }

  /**
   * Cleans up expired files.
   * STRICT SAFETY RULE: Deletes only objects strictly prefixed with AWS_S3_PREFIX.
   * Never applies bucket-wide deletion.
   */
  public async cleanupExpiredFiles(): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();
    const maxAgeMs = config.FILE_RETENTION_HOURS * 60 * 60 * 1000;

    try {
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix,
          ContinuationToken: continuationToken
        });

        const response = await this.s3Client.send(listCommand);
        const toDelete: { Key: string }[] = [];

        if (response.Contents) {
          for (const item of response.Contents) {
            // Safety guard: ensure item key is strictly under our prefix
            if (!item.Key || !item.Key.startsWith(this.prefix)) {
              continue;
            }
            // Do not delete root prefix placeholder
            if (item.Key === this.prefix) {
              continue;
            }

            if (item.LastModified && now - item.LastModified.getTime() > maxAgeMs) {
              toDelete.push({ Key: item.Key });
            }
          }
        }

        if (toDelete.length > 0) {
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: toDelete,
              Quiet: true
            }
          });
          await this.s3Client.send(deleteCommand);
          deletedCount += toDelete.length;
          logger.info('Deleted expired S3 objects', { count: toDelete.length, prefix: this.prefix });
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      // Clean local worker scratch directories
      const cleanDirectory = async (dir: string) => {
        if (!fsSync.existsSync(dir)) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            if (entry.name === '.gitkeep') continue;
            const fullPath = path.join(dir, entry.name);
            const stats = await fs.stat(fullPath);
            if (now - stats.mtimeMs > maxAgeMs) {
              await fs.unlink(fullPath).catch(() => {});
            }
          }
        }
      };

      await cleanDirectory(this.tempDir);
      await cleanDirectory(this.outputDir);
    } catch (err) {
      logger.error('Error during S3 storage cleanup', { err: (err as Error).message });
    }

    logger.info('S3 storage cleanup finished', { deletedObjects: deletedCount, prefix: this.prefix });
    return deletedCount;
  }

  public async getSignedDownloadUrl(keyOrPath: string, expiresInSeconds = 900): Promise<string> {
    const key = this.validateKey(keyOrPath);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }
}
