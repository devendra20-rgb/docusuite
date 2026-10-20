import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pdfEngine } from '../../../adapters/pdf/pdf-engine.adapter.js';
import { jobService } from '../../jobs/services/job.service.js';
import { enqueueDocumentJob } from '../../../queues/document.queue.js';
import { storageService } from '../../../services/storage.service.js';
import { ValidationError, AppError } from '../../../utils/errors.js';
import { processDocumentJob } from '../../../workers/document.worker.js';

export class PdfToolsController {
  private async dispatchOrProcess(
    req: Request,
    operation: string,
    toolName: string,
    parameters: Record<string, unknown> = {}
  ) {
    const isAsync = req.query.async === 'true' || req.body.async === 'true' || req.body.async === true;
    const storedFiles = req.storedFiles || [];

    if (storedFiles.length === 0) {
      throw new ValidationError('No files were uploaded with this request');
    }

    const inputFiles = storedFiles.map((f) => ({
      fileId: f.fileId,
      originalName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      path: f.storedPath
    }));

    const job = await jobService.createJob({
      tool: toolName,
      userId: req.user?.id,
      isGuest: req.isGuest || false,
      guestIp: req.guestIp,
      inputFiles,
      parameters
    });

    const jobData = {
      jobId: job.jobId as string,
      tool: toolName,
      operation,
      userId: req.user?.id,
      isGuest: req.isGuest || false,
      guestIp: req.guestIp,
      inputFiles,
      parameters
    };

    if (isAsync) {
      await enqueueDocumentJob(jobData);
      return {
        success: true,
        jobId: job.jobId,
        status: 'queued',
        checkStatusUrl: `/api/jobs/${job.jobId}`,
        downloadUrl: `/api/jobs/${job.jobId}/download`
      };
    } else {
      // Execute inline directly using worker processor for instant synchronous response
      await processDocumentJob({
        id: job.jobId,
        data: jobData,
        updateProgress: async () => {}
      } as any);

      const completed = await jobService.getJobById(job.jobId as string);
      return {
        success: true,
        jobId: job.jobId,
        status: 'completed',
        outputFiles: completed.outputFiles,
        downloadUrl: `/api/jobs/${job.jobId}/download`
      };
    }
  }

  // 1. Merge PDF
  public merge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.storedFiles || req.storedFiles.length < 2) {
        throw new ValidationError('Merging requires at least 2 PDF documents');
      }
      const result = await this.dispatchOrProcess(req, 'pdf-merge', 'merge');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 2. Split PDF
  public split = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ranges = (req.body.ranges || req.body.pageRanges) as string | undefined;
      const result = await this.dispatchOrProcess(req, 'pdf-split', 'split', { ranges });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 3. Compress PDF
  public compress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchOrProcess(req, 'pdf-compress', 'compress');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 4 & 5. PDF to Images (JPG or PNG)
  public toImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const format = (req.body.format || req.query.format || 'png').toString().toLowerCase();
      if (format !== 'jpg' && format !== 'jpeg' && format !== 'png') {
        throw new ValidationError('Format must be either jpg or png');
      }
      const normalizedFormat = format === 'jpeg' ? 'jpg' : format;
      const result = await this.dispatchOrProcess(req, 'pdf-to-images', 'to-images', { format: normalizedFormat });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 6 & 7. Images to PDF
  public imagesToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.storedFiles || req.storedFiles.length === 0) {
        throw new ValidationError('At least one image file is required');
      }
      const result = await this.dispatchOrProcess(req, 'images-to-pdf', 'images-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 8. Rotate PDF
  public rotate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rotation = Number(req.body.rotation) || 90;
      if (![90, 180, 270].includes(rotation)) {
        throw new ValidationError('Rotation must be 90, 180, or 270 degrees');
      }
      let pages: number[] | undefined;
      if (req.body.pages) {
        pages = Array.isArray(req.body.pages)
          ? req.body.pages.map(Number)
          : String(req.body.pages).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      const result = await this.dispatchOrProcess(req, 'pdf-rotate', 'rotate', { rotation, pages });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 9. Reorder PDF
  public reorder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let pageOrder: number[];
      if (Array.isArray(req.body.pageOrder)) {
        pageOrder = req.body.pageOrder.map(Number);
      } else if (typeof req.body.pageOrder === 'string') {
        try {
          pageOrder = JSON.parse(req.body.pageOrder);
        } catch {
          pageOrder = req.body.pageOrder.split(',').map(Number);
        }
      } else {
        throw new ValidationError('pageOrder array is required (e.g. [3, 1, 2])');
      }

      const result = await this.dispatchOrProcess(req, 'pdf-reorder', 'reorder', { pageOrder });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 10. Extract PDF pages
  public extract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let pages: number[];
      if (Array.isArray(req.body.pages)) {
        pages = req.body.pages.map(Number);
      } else if (typeof req.body.pages === 'string') {
        try {
          pages = JSON.parse(req.body.pages);
        } catch {
          pages = req.body.pages.split(',').map(Number);
        }
      } else {
        throw new ValidationError('pages array is required (e.g. [1, 3])');
      }

      const result = await this.dispatchOrProcess(req, 'pdf-extract', 'extract', { pages });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 11. Delete PDF pages
  public deletePages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let pages: number[];
      if (Array.isArray(req.body.pages)) {
        pages = req.body.pages.map(Number);
      } else if (typeof req.body.pages === 'string') {
        try {
          pages = JSON.parse(req.body.pages);
        } catch {
          pages = req.body.pages.split(',').map(Number);
        }
      } else {
        throw new ValidationError('pages array is required (e.g. [2, 4])');
      }

      const result = await this.dispatchOrProcess(req, 'pdf-delete', 'delete', { pages });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 12. Organize PDF pages
  public organize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let operations = req.body.operations;
      if (typeof operations === 'string') {
        operations = JSON.parse(operations);
      }
      if (!Array.isArray(operations)) {
        throw new ValidationError('operations must be an array of page configurations');
      }

      const result = await this.dispatchOrProcess(req, 'pdf-organize', 'organize', { operations });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 13. Crop PDF
  public crop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const top = Number(req.body.top) || 0;
      const bottom = Number(req.body.bottom) || 0;
      const left = Number(req.body.left) || 0;
      const right = Number(req.body.right) || 0;

      const result = await this.dispatchOrProcess(req, 'pdf-crop', 'crop', { top, bottom, left, right });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 14. Add Page Numbers
  public addPageNumbers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const format = req.body.format || 'page_of_total';
      const position = req.body.position || 'bottom-center';
      const fontSize = Number(req.body.fontSize) || 10;
      const startPage = Number(req.body.startPage) || 1;

      const result = await this.dispatchOrProcess(req, 'pdf-page-numbers', 'page-numbers', {
        format,
        position,
        fontSize,
        startPage
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 15. Add Watermark
  public addWatermark = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const text = req.body.text as string | undefined;
      const opacity = Number(req.body.opacity) || 0.3;
      const rotationDegrees = Number(req.body.rotationDegrees) || 45;
      const fontSize = Number(req.body.fontSize) || 50;

      const result = await this.dispatchOrProcess(req, 'pdf-watermark', 'watermark', {
        text,
        opacity,
        rotationDegrees,
        fontSize
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 16. Protect PDF
  public protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const password = req.body.password as string;
      const ownerPassword = req.body.ownerPassword as string | undefined;
      if (!password || password.trim().length === 0) {
        throw new ValidationError('password is required to protect PDF');
      }

      const result = await this.dispatchOrProcess(req, 'pdf-protect', 'protect', {
        password,
        ownerPassword
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 17. Unlock PDF
  public unlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const password = req.body.password as string;
      if (!password) {
        throw new ValidationError('password is required to unlock PDF');
      }

      const result = await this.dispatchOrProcess(req, 'pdf-unlock', 'unlock', {
        password
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const pdfToolsController = new PdfToolsController();
