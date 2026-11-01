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
    const isAsync =
      req.query.async === 'true' ||
      req.query.async === '1' ||
      req.body.async === 'true' ||
      req.body.async === true ||
      req.body.async === 1 ||
      req.body.async === '1';
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

    const effectiveParameters: Record<string, unknown> = {
      ...(typeof req.body === 'object' && req.body !== null ? req.body : {}),
      ...parameters
    };

    const job = await jobService.createJob({
      tool: toolName,
      userId: req.user?.id,
      isGuest: req.isGuest || false,
      guestIp: req.guestIp,
      inputFiles,
      parameters: effectiveParameters
    });

    const jobData = {
      jobId: job.jobId as string,
      tool: toolName,
      operation,
      userId: req.user?.id,
      isGuest: req.isGuest || false,
      guestIp: req.guestIp,
      inputFiles,
      parameters: effectiveParameters
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
      let fileOperations = req.body.fileOperations || req.body.operations;
      if (typeof fileOperations === 'string') {
        try {
          fileOperations = JSON.parse(fileOperations);
        } catch {
          // ignore parsing error
        }
      }
      const result = await this.dispatchOrProcess(req, 'pdf-merge', 'merge', { fileOperations });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // 2. Split PDF
  public split = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ranges = (req.body.ranges || req.body.pageRanges) as string | undefined;
      const mergeOne = req.body.mergeOne === 'true' || req.body.mergeOne === true || req.body.merge === 'true' || req.body.merge === true;
      const result = await this.dispatchOrProcess(req, 'pdf-split', 'split', { ranges, mergeOne });
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
      const format = (req.body.format || req.query.format || 'jpg').toString().toLowerCase();
      if (format !== 'jpg' && format !== 'jpeg' && format !== 'png') {
        throw new ValidationError('Format must be either jpg or png');
      }
      const normalizedFormat = format === 'jpeg' ? 'jpg' : format;

      let dpi: number | undefined;
      if (req.body.dpi !== undefined && req.body.dpi !== '') {
        const parsedDpi = Number(req.body.dpi);
        if (isNaN(parsedDpi) || parsedDpi < 36 || parsedDpi > 600) {
          throw new ValidationError('DPI must be a number between 36 and 600 (e.g. 72, 150, 300)');
        }
        dpi = parsedDpi;
      }

      let quality: number | undefined;
      if (req.body.quality !== undefined && req.body.quality !== '') {
        const parsedQuality = Number(req.body.quality);
        if (isNaN(parsedQuality) || parsedQuality < 10 || parsedQuality > 100) {
          throw new ValidationError('Quality must be an integer between 10 and 100');
        }
        quality = Math.round(parsedQuality);
      }

      let pages: number[] | undefined;
      if (req.body.pages !== undefined && req.body.pages !== '') {
        const rawList = Array.isArray(req.body.pages)
          ? req.body.pages
          : String(req.body.pages).split(',').map((s) => s.trim()).filter(Boolean);

        if (rawList.length > 0) {
          pages = (rawList as any[]).map((item: any) => {
            const n = Number(item);
            if (isNaN(n) || !Number.isInteger(n) || n < 1) {
              throw new ValidationError(`Invalid page number "${item}" in pages parameter`);
            }
            return n;
          });
        }
      }

      const password = req.body.password ? String(req.body.password) : undefined;

      const result = await this.dispatchOrProcess(req, 'pdf-to-images', 'to-images', {
        format: normalizedFormat,
        dpi,
        quality,
        pages,
        password
      });
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
      let rawRotation = 90;
      if (req.body.rotation !== undefined && req.body.rotation !== '') {
        const parsed = Number(req.body.rotation);
        if (isNaN(parsed) || parsed % 90 !== 0) {
          throw new ValidationError('Rotation must be 0, 90, 180, or 270 degrees');
        }
        rawRotation = parsed;
      }
      const rotation = ((rawRotation % 360) + 360) % 360;
      if (![0, 90, 180, 270].includes(rotation)) {
        throw new ValidationError('Rotation must be 0, 90, 180, or 270 degrees');
      }

      let pages: number[] | undefined;
      if (req.body.pages !== undefined && req.body.pages !== '') {
        const rawList = Array.isArray(req.body.pages)
          ? req.body.pages
          : String(req.body.pages).split(',').map((s) => s.trim()).filter(Boolean);

        if (rawList.length === 0) {
          throw new ValidationError('Invalid page number specified in pages parameter');
        }

        pages = (rawList as any[]).map((item: any) => {
          const n = Number(item);
          if (isNaN(n) || !Number.isInteger(n) || n < 1) {
            throw new ValidationError(`Invalid page number "${item}" in pages parameter`);
          }
          return n;
        });
      }

      let pageRotations: any = undefined;
      if (req.body.pageRotations !== undefined && req.body.pageRotations !== '') {
        pageRotations = req.body.pageRotations;
        if (typeof pageRotations === 'string') {
          try {
            pageRotations = JSON.parse(pageRotations);
          } catch {
            throw new ValidationError('pageRotations must be valid JSON');
          }
        }
      }

      const result = await this.dispatchOrProcess(req, 'pdf-rotate', 'rotate', {
        rotation,
        pages,
        pageRotations
      });
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
      const rawPages = req.body.pages ?? req.body.ranges ?? req.body.pageRanges;
      if (rawPages === undefined || rawPages === null || (typeof rawPages === 'string' && rawPages.trim() === '')) {
        throw new ValidationError('pages array or range is required (e.g. "1-4" or [1, 3])');
      }

      const pages = pdfEngine.parseExtractPages(rawPages);
      if (pages.length === 0) {
        throw new ValidationError('At least one page must be specified for extraction');
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

      let pages: number[] | undefined;
      if (req.body.pages) {
        if (Array.isArray(req.body.pages)) {
          pages = req.body.pages.map(Number);
        } else if (typeof req.body.pages === 'string') {
          try {
            const parsed = JSON.parse(req.body.pages);
            if (Array.isArray(parsed)) pages = parsed.map(Number);
          } catch {
            pages = req.body.pages
              .split(',')
              .map((s: string) => Number(s.trim()))
              .filter((n: number) => !isNaN(n) && n > 0);
          }
        }
      }

      let pageCrops: Record<number, any> | undefined;
      if (req.body.pageCrops) {
        if (typeof req.body.pageCrops === 'string') {
          try {
            pageCrops = JSON.parse(req.body.pageCrops);
          } catch {
            // ignore
          }
        } else if (typeof req.body.pageCrops === 'object') {
          pageCrops = req.body.pageCrops;
        }
      }

      let pageRotations: Record<number, number> | undefined;
      if (req.body.pageRotations) {
        if (typeof req.body.pageRotations === 'string') {
          try {
            pageRotations = JSON.parse(req.body.pageRotations);
          } catch {
            // ignore
          }
        } else if (typeof req.body.pageRotations === 'object') {
          pageRotations = req.body.pageRotations;
        }
      }

      const result = await this.dispatchOrProcess(req, 'pdf-crop', 'crop', {
        top,
        bottom,
        left,
        right,
        ...(pages ? { pages } : {}),
        ...(pageCrops ? { pageCrops } : {}),
        ...(pageRotations ? { pageRotations } : {})
      });
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
      const startNumber = req.body.startNumber !== undefined && req.body.startNumber !== '' ? Number(req.body.startNumber) : 1;
      const skipFirst = req.body.skipFirst === 'true' || req.body.skipFirst === true;
      const font = req.body.font || 'helvetica';
      const color = req.body.color;
      const background = req.body.background || 'none';

      let pages: number[] | undefined;
      if (req.body.pages) {
        if (typeof req.body.pages === 'string') {
          try {
            pages = JSON.parse(req.body.pages);
          } catch {
            pages = req.body.pages.split(',').map((p: string) => Number(p.trim())).filter((n: number) => !isNaN(n));
          }
        } else if (Array.isArray(req.body.pages)) {
          pages = req.body.pages.map(Number).filter((n: number) => !isNaN(n));
        }
      }

      let margin: number | undefined;
      if (req.body.margin !== undefined && req.body.margin !== '') {
        margin = Number(req.body.margin);
      }
      let marginTop: number | undefined;
      if (req.body.marginTop !== undefined && req.body.marginTop !== '') {
        marginTop = Number(req.body.marginTop);
      }
      let marginBottom: number | undefined;
      if (req.body.marginBottom !== undefined && req.body.marginBottom !== '') {
        marginBottom = Number(req.body.marginBottom);
      }
      let marginLeft: number | undefined;
      if (req.body.marginLeft !== undefined && req.body.marginLeft !== '') {
        marginLeft = Number(req.body.marginLeft);
      }
      let marginRight: number | undefined;
      if (req.body.marginRight !== undefined && req.body.marginRight !== '') {
        marginRight = Number(req.body.marginRight);
      }

      let pageRotations: Record<number, number> | undefined;
      if (req.body.pageRotations) {
        if (typeof req.body.pageRotations === 'string') {
          try {
            pageRotations = JSON.parse(req.body.pageRotations);
          } catch {
            pageRotations = undefined;
          }
        } else if (typeof req.body.pageRotations === 'object') {
          pageRotations = req.body.pageRotations;
        }
      }

      const result = await this.dispatchOrProcess(req, 'pdf-page-numbers', 'page-numbers', {
        format,
        position,
        fontSize,
        startPage,
        startNumber,
        skipFirst,
        font,
        background,
        ...(color !== undefined ? { color } : {}),
        ...(pages !== undefined ? { pages } : {}),
        ...(margin !== undefined ? { margin } : {}),
        ...(marginTop !== undefined ? { marginTop } : {}),
        ...(marginBottom !== undefined ? { marginBottom } : {}),
        ...(marginLeft !== undefined ? { marginLeft } : {}),
        ...(marginRight !== undefined ? { marginRight } : {}),
        ...(pageRotations !== undefined ? { pageRotations } : {})
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
      const opacity = req.body.opacity !== undefined && req.body.opacity !== '' ? Number(req.body.opacity) : 0.3;
      const rotationDegrees = req.body.rotationDegrees !== undefined && req.body.rotationDegrees !== '' ? Number(req.body.rotationDegrees) : 45;
      const fontSize = req.body.fontSize !== undefined && req.body.fontSize !== '' ? Number(req.body.fontSize) : 48;
      const font = req.body.font as string | undefined;
      const position = req.body.position as string | undefined;
      const style = req.body.style as string | undefined;
      const background = req.body.background as string | undefined;
      const customXRatio = req.body.customXRatio !== undefined && req.body.customXRatio !== '' ? Number(req.body.customXRatio) : undefined;
      const customYRatio = req.body.customYRatio !== undefined && req.body.customYRatio !== '' ? Number(req.body.customYRatio) : undefined;
      const imageWidth = req.body.imageWidth !== undefined && req.body.imageWidth !== '' ? Number(req.body.imageWidth) : undefined;
      const imageHeight = req.body.imageHeight !== undefined && req.body.imageHeight !== '' ? Number(req.body.imageHeight) : undefined;
      const isBold = req.body.isBold !== undefined ? (req.body.isBold === 'true' || req.body.isBold === true) : undefined;
      const isItalic = req.body.isItalic !== undefined ? (req.body.isItalic === 'true' || req.body.isItalic === true) : undefined;
      const imageBase64 = req.body.imageBase64 as string | undefined;
      const imageMimeType = req.body.imageMimeType as string | undefined;

      let color = req.body.color;
      if (typeof color === 'string') {
        try {
          if (color.startsWith('{')) {
            color = JSON.parse(color);
          }
        } catch {
          // keep as string (e.g. hex #E11D48)
        }
      }

      let pages: number[] | undefined;
      if (req.body.pages) {
        if (typeof req.body.pages === 'string') {
          try {
            pages = JSON.parse(req.body.pages);
          } catch {
            pages = req.body.pages.split(',').map((p: string) => Number(p.trim())).filter((n: number) => !isNaN(n));
          }
        } else if (Array.isArray(req.body.pages)) {
          pages = req.body.pages.map(Number).filter((n: number) => !isNaN(n));
        }
      }

      let pageRotations: Record<number, number> | undefined;
      if (req.body.pageRotations) {
        if (typeof req.body.pageRotations === 'string') {
          try {
            pageRotations = JSON.parse(req.body.pageRotations);
          } catch {
            pageRotations = undefined;
          }
        } else if (typeof req.body.pageRotations === 'object') {
          pageRotations = req.body.pageRotations;
        }
      }
      const result = await this.dispatchOrProcess(req, 'pdf-watermark', 'watermark', {
        ...(text !== undefined ? { text } : {}),
        opacity,
        rotationDegrees,
        fontSize,
        ...(font ? { font } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(position ? { position } : {}),
        ...(style ? { style } : {}),
        ...(background ? { background } : {}),
        ...(customXRatio !== undefined ? { customXRatio } : {}),
        ...(customYRatio !== undefined ? { customYRatio } : {}),
        ...(pages !== undefined ? { pages } : {}),
        ...(pageRotations !== undefined ? { pageRotations } : {}),
        ...(imageWidth !== undefined ? { imageWidth } : {}),
        ...(imageHeight !== undefined ? { imageHeight } : {}),
        ...(isBold !== undefined ? { isBold } : {}),
        ...(isItalic !== undefined ? { isItalic } : {}),
        ...(imageBase64 ? { imageBase64 } : {}),
        ...(imageMimeType ? { imageMimeType } : {})
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
