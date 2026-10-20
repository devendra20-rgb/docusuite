import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { config } from '../config/index.js';
import { storageService, StoredFileMetadata } from '../services/storage.service.js';
import { detectFileTypeFromBuffer } from '../utils/file-signatures.js';
import { AppError, ValidationError } from '../utils/errors.js';

const storage = multer.memoryStorage();

const allowedMimes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/csv',
  'text/plain',
  'text/html',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation'
]);

const allowedExtensions = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.pptx',
  '.ppt',
  '.csv',
  '.txt',
  '.html',
  '.htm',
  '.rtf',
  '.odt',
  '.ods',
  '.odp'
]);

export const multerUpload = multer({
  storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE_BYTES,
    files: config.MAX_FILES_PER_REQUEST
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return cb(new ValidationError(`File extension ${ext} is not allowed`));
    }
    cb(null, true);
  }
});

declare global {
  namespace Express {
    interface Request {
      storedFiles?: StoredFileMetadata[];
    }
  }
}

/**
 * Middleware that validates file signatures and stores incoming files into the controlled storage directory
 */
export const processUploads = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const files: Express.Multer.File[] = [];

    if (req.file) {
      files.push(req.file);
    } else if (Array.isArray(req.files)) {
      files.push(...req.files);
    } else if (req.files && typeof req.files === 'object') {
      for (const field of Object.values(req.files)) {
        if (Array.isArray(field)) {
          files.push(...field);
        }
      }
    }

    if (files.length === 0) {
      return next();
    }

    const storedFiles: StoredFileMetadata[] = [];

    for (const file of files) {
      // Security: Validate magic bytes
      const detectedType = detectFileTypeFromBuffer(file.buffer);

      // Verify that extension matches buffer content
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.pdf' && detectedType.category !== 'pdf') {
        throw new ValidationError(`File ${file.originalname} has .pdf extension but invalid PDF signature`);
      }
      if ((ext === '.jpg' || ext === '.jpeg' || ext === '.png') && detectedType.category !== 'image') {
        throw new ValidationError(`File ${file.originalname} has image extension but invalid image signature`);
      }

      const stored = await storageService.saveTempFile(
        file.originalname,
        file.buffer,
        detectedType.mime || file.mimetype
      );
      storedFiles.push(stored);
    }

    req.storedFiles = storedFiles;
    next();
  } catch (err) {
    next(err);
  }
};
