export interface StoredFileMetadata {
  fileId: string;
  originalName: string;
  filename: string;
  storedPath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
  provider?: 'local' | 's3';
  s3Key?: string;
  s3Bucket?: string;
}

export interface IStorageService {
  readonly provider: 'local' | 's3';
  readonly tempDir: string;
  readonly outputDir: string;
  saveTempFile(originalName: string, buffer: Buffer, mimeType: string): Promise<StoredFileMetadata>;
  saveOutputFile(filename: string, buffer: Buffer, mimeType: string): Promise<StoredFileMetadata>;
  getFileBuffer(filePathOrKey: string): Promise<Buffer>;
  getFileStream(filePathOrKey: string): Promise<NodeJS.ReadableStream>;
  deleteFile(filePathOrKey: string): Promise<void>;
  fileExists(filePathOrKey: string): Promise<boolean>;
  cleanupExpiredFiles(): Promise<number>;
  ensureDirectories(): Promise<void>;
  getTempDir(): string;
  getOutputDir(): string;
  getSignedDownloadUrl?(fileKey: string, expiresInSeconds?: number): Promise<string>;
}
