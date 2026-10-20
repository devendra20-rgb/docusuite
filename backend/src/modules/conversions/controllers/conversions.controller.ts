import { Request, Response, NextFunction } from 'express';
import path from 'path';
import archiver from 'archiver';
import fs from 'fs/promises';
import fsSync from 'fs';
import { conversionRouter } from '../../../adapters/converters/conversion-router.service.js';
import { jobService } from '../../jobs/services/job.service.js';
import { enqueueDocumentJob } from '../../../queues/document.queue.js';
import { storageService } from '../../../services/storage.service.js';
import { ValidationError, AppError } from '../../../utils/errors.js';
import { processDocumentJob } from '../../../workers/document.worker.js';

export class ConversionsController {
  private async dispatchConversion(
    req: Request,
    targetFormat: string,
    toolName: string
  ) {
    const isAsync = req.query.async === 'true' || req.body.async === 'true' || req.body.async === true;
    const storedFiles = req.storedFiles || [];

    if (storedFiles.length === 0) {
      throw new ValidationError('No document file was uploaded for conversion');
    }

    const inputFiles = storedFiles.map((f) => ({
      fileId: f.fileId,
      originalName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      path: f.storedPath
    }));

    const parameters = { targetFormat, ...req.body };

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
      operation: 'convert-document',
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

  public getCapabilities = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const capabilities = await conversionRouter.getEngineCapabilities();
      res.status(200).json({
        success: true,
        data: capabilities,
        engines: capabilities
      });
    } catch (err) {
      next(err);
    }
  };

  public pdfToWord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'docx', 'pdf-to-word');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public wordToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'word-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public pdfToExcel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'xlsx', 'pdf-to-excel');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public excelToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'excel-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public pdfToPowerPoint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pptx', 'pdf-to-powerpoint');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public powerPointToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'powerpoint-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public htmlToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'html-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public wordToHtml = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'html', 'word-to-html');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public csvToExcel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'xlsx', 'csv-to-excel');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public excelToCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'csv', 'excel-to-csv');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public txtToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'txt-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public rtfToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'rtf-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public pdfToHtml = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'html', 'pdf-to-html');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public odtToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'odt-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public odsToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'ods-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public odpToPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatchConversion(req, 'pdf', 'odp-to-pdf');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // Batch conversions: processes multiple files to the specified target format
  public batch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetFormat = (req.body.targetFormat || 'pdf').toLowerCase().replace('.', '');
      const files = req.storedFiles || [];

      if (files.length === 0) {
        throw new ValidationError('No files uploaded for batch conversion');
      }

      const inputFiles = files.map((f) => ({
        fileId: f.fileId,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        path: f.storedPath
      }));

      const job = await jobService.createJob({
        tool: 'batch-convert',
        userId: req.user?.id,
        isGuest: req.isGuest || false,
        guestIp: req.guestIp,
        inputFiles,
        parameters: { targetFormat }
      });

      const results = [];
      const outputFiles = [];

      for (const file of files) {
        const fromExt = path.extname(file.originalName).replace('.', '');
        const baseName = path.basename(file.originalName, path.extname(file.originalName));
        const outName = `${baseName}.${targetFormat}`;
        const outputPath = path.join(storageService['outputDir'], `${file.fileId}-${outName}`);

        const conversion = await conversionRouter.routeConversion(
          file.storedPath,
          outputPath,
          fromExt,
          targetFormat
        );

        results.push({
          fileId: file.fileId,
          originalName: file.originalName,
          convertedName: outName,
          filename: outName,
          mimeType: conversion.outputMime,
          size: conversion.fileSize,
          engineUsed: conversion.engineUsed,
          limitations: conversion.limitations,
          downloadUrl: `/api/jobs/${job.jobId}/download/${file.fileId}`
        });

        outputFiles.push({
          fileId: file.fileId,
          originalName: outName,
          filename: outName,
          mimeType: conversion.outputMime,
          size: conversion.fileSize,
          path: outputPath,
          downloadUrl: `/api/jobs/${job.jobId}/download/${file.fileId}`
        });
      }

      await jobService.markJobCompleted(job.jobId as string, outputFiles);

      res.status(200).json({
        success: true,
        jobId: job.jobId,
        batchCount: results.length,
        items: results,
        outputFiles: outputFiles,
        downloadUrl: `/api/jobs/${job.jobId}/download`
      });
    } catch (err) {
      next(err);
    }
  };
}

export const conversionsController = new ConversionsController();
