import { Worker, Job } from 'bullmq';
import path from 'path';
import archiver from 'archiver';
import fs from 'fs/promises';
import fsSync from 'fs';
import { DOCUMENT_QUEUE_NAME, DocumentJobData } from '../queues/document.queue.js';
import { getRedisClient } from '../config/redis.js';
import { pdfEngine } from '../adapters/pdf/pdf-engine.adapter.js';
import { conversionRouter } from '../adapters/converters/conversion-router.service.js';
import { storageService } from '../services/storage.service.js';
import { jobService } from '../modules/jobs/services/job.service.js';
import { createChildLogger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { IJobOutputFile } from '../modules/jobs/models/job.model.js';

const logger = createChildLogger('DocumentWorker');

export const processDocumentJob = async (job: Job<DocumentJobData>): Promise<void> => {
  const { jobId, operation, inputFiles, parameters = {} } = job.data;
  const startTime = Date.now();
  logger.info('Processing job', { jobId, operation });

  await job.updateProgress(10);
  await jobService.updateJobProgress(jobId, 10, 'processing');

  try {
    const outputFiles: IJobOutputFile[] = [];

    // PHASE 1: PDF TOOLS
    if (operation === 'pdf-merge') {
      const buffers = await Promise.all(
        inputFiles.map(f => storageService.getFileBuffer(f.path))
      );
      await job.updateProgress(40);
      const mergedBuffer = await pdfEngine.merge(buffers);
      await job.updateProgress(80);

      const saved = await storageService.saveOutputFile('merged.pdf', mergedBuffer, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: 'merged.pdf',
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-split') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const ranges = parameters.ranges as string | undefined;
      await job.updateProgress(40);
      const parts = await pdfEngine.split(buffer, ranges);
      await job.updateProgress(75);

      if (parts.length === 1) {
        const saved = await storageService.saveOutputFile(parts[0].name, parts[0].buffer, 'application/pdf');
        outputFiles.push({
          fileId: saved.fileId,
          filename: saved.filename,
          originalName: parts[0].name,
          mimeType: 'application/pdf',
          size: saved.size,
          path: saved.storedPath,
          downloadUrl: `/api/jobs/${jobId}/download`
        });
      } else {
        // Zip archive for multiple split pages
        const zipName = `split-pages-${jobId.substring(0, 8)}.zip`;
        const zipPath = path.join(storageService['outputDir'], `${jobId}-${zipName}`);
        const output = fsSync.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);
        for (const part of parts) {
          archive.append(part.buffer, { name: part.name });
        }
        await archive.finalize();

        await new Promise<void>((resolve, reject) => {
          output.on('close', () => resolve());
          output.on('error', reject);
        });

        const stats = await fs.stat(zipPath);
        outputFiles.push({
          fileId: jobId,
          filename: `${jobId}-${zipName}`,
          originalName: zipName,
          mimeType: 'application/zip',
          size: stats.size,
          path: zipPath,
          downloadUrl: `/api/jobs/${jobId}/download`
        });
      }
    } else if (operation === 'pdf-compress') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      await job.updateProgress(40);
      const compressed = await pdfEngine.compress(buffer);
      await job.updateProgress(80);

      const saved = await storageService.saveOutputFile(
        `compressed-${inputFiles[0].originalName}`,
        compressed,
        'application/pdf'
      );
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `compressed-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-rotate') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const rotation = (parameters.rotation as 90 | 180 | 270) || 90;
      const pages = parameters.pages as number[] | undefined;
      await job.updateProgress(40);
      const rotated = await pdfEngine.rotate(buffer, rotation, pages);
      await job.updateProgress(80);

      const saved = await storageService.saveOutputFile(
        `rotated-${inputFiles[0].originalName}`,
        rotated,
        'application/pdf'
      );
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `rotated-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-to-images') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const format = (parameters.format as 'jpg' | 'png') || 'png';
      await job.updateProgress(40);
      const images = await pdfEngine.pdfToImages(buffer, format);
      await job.updateProgress(75);

      if (images.length === 1) {
        const ext = format === 'jpg' ? '.jpg' : '.png';
        const saved = await storageService.saveOutputFile(
          `page-1${ext}`,
          images[0].buffer,
          images[0].mimeType
        );
        outputFiles.push({
          fileId: saved.fileId,
          filename: saved.filename,
          originalName: `page-1${ext}`,
          mimeType: images[0].mimeType,
          size: saved.size,
          path: saved.storedPath,
          downloadUrl: `/api/jobs/${jobId}/download`
        });
      } else {
        const zipName = `pdf-images-${jobId.substring(0, 8)}.zip`;
        const zipPath = path.join(storageService['outputDir'], `${jobId}-${zipName}`);
        const output = fsSync.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);
        const ext = format === 'jpg' ? '.jpg' : '.png';
        for (const img of images) {
          archive.append(img.buffer, { name: `page-${img.page}${ext}` });
        }
        await archive.finalize();

        await new Promise<void>((resolve, reject) => {
          output.on('close', () => resolve());
          output.on('error', reject);
        });

        const stats = await fs.stat(zipPath);
        outputFiles.push({
          fileId: jobId,
          filename: `${jobId}-${zipName}`,
          originalName: zipName,
          mimeType: 'application/zip',
          size: stats.size,
          path: zipPath,
          downloadUrl: `/api/jobs/${jobId}/download`
        });
      }
    } else if (operation === 'images-to-pdf') {
      const images = await Promise.all(
        inputFiles.map(async (f) => ({
          buffer: await storageService.getFileBuffer(f.path),
          mimeType: f.mimeType
        }))
      );
      await job.updateProgress(40);
      const pdfBuffer = await pdfEngine.imagesToPdf(images);
      await job.updateProgress(80);

      const saved = await storageService.saveOutputFile('converted-images.pdf', pdfBuffer, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: 'converted-images.pdf',
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-reorder') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const pageOrder = parameters.pageOrder as number[];
      const reordered = await pdfEngine.reorder(buffer, pageOrder);
      const saved = await storageService.saveOutputFile(`reordered-${inputFiles[0].originalName}`, reordered, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `reordered-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-extract') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const pages = parameters.pages as number[];
      const extracted = await pdfEngine.extract(buffer, pages);
      const saved = await storageService.saveOutputFile(`extracted-${inputFiles[0].originalName}`, extracted, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `extracted-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-delete') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const pages = parameters.pages as number[];
      const remaining = await pdfEngine.deletePages(buffer, pages);
      const saved = await storageService.saveOutputFile(`edited-${inputFiles[0].originalName}`, remaining, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `edited-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-organize') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const operations = parameters.operations as any[];
      const organized = await pdfEngine.organize(buffer, operations);
      const saved = await storageService.saveOutputFile(`organized-${inputFiles[0].originalName}`, organized, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `organized-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-crop') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const cropped = await pdfEngine.crop(buffer, parameters as any);
      const saved = await storageService.saveOutputFile(`cropped-${inputFiles[0].originalName}`, cropped, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `cropped-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-page-numbers') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const numbered = await pdfEngine.addPageNumbers(buffer, parameters as any);
      const saved = await storageService.saveOutputFile(`numbered-${inputFiles[0].originalName}`, numbered, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `numbered-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-watermark') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const watermarked = await pdfEngine.addWatermark(buffer, parameters as any);
      const saved = await storageService.saveOutputFile(`watermarked-${inputFiles[0].originalName}`, watermarked, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `watermarked-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-protect') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const password = parameters.password as string;
      const ownerPassword = parameters.ownerPassword as string | undefined;
      const protectedPdf = await pdfEngine.protect(buffer, password, ownerPassword);
      const saved = await storageService.saveOutputFile(`protected-${inputFiles[0].originalName}`, protectedPdf, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `protected-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else if (operation === 'pdf-unlock') {
      const buffer = await storageService.getFileBuffer(inputFiles[0].path);
      const password = parameters.password as string;
      const unlockedPdf = await pdfEngine.unlock(buffer, password);
      const saved = await storageService.saveOutputFile(`unlocked-${inputFiles[0].originalName}`, unlockedPdf, 'application/pdf');
      outputFiles.push({
        fileId: saved.fileId,
        filename: saved.filename,
        originalName: `unlocked-${inputFiles[0].originalName}`,
        mimeType: 'application/pdf',
        size: saved.size,
        path: saved.storedPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    }

    // PHASE 2: CONVERSION WORKFLOWS
    else if (operation.startsWith('convert-') || operation === 'office-convert') {
      const input = inputFiles[0];
      const fromExt = path.extname(input.originalName).replace('.', '');
      const toExt = (parameters.targetFormat as string || 'pdf').toLowerCase().replace('.', '');

      const baseName = path.basename(input.originalName, path.extname(input.originalName));
      const targetFilename = `${baseName}.${toExt}`;
      const outputPath = path.join(storageService['outputDir'], `${jobId}-${targetFilename}`);

      await job.updateProgress(40);
      const result = await conversionRouter.routeConversion(
        input.path,
        outputPath,
        fromExt,
        toExt,
        parameters
      );
      await job.updateProgress(85);

      outputFiles.push({
        fileId: jobId,
        filename: `${jobId}-${targetFilename}`,
        originalName: targetFilename,
        mimeType: result.outputMime,
        size: result.fileSize,
        path: result.outputPath,
        downloadUrl: `/api/jobs/${jobId}/download`
      });
    } else {
      throw new AppError(`Unknown operation: ${operation}`, 400);
    }

    const durationMs = Date.now() - startTime;
    await job.updateProgress(100);
    await jobService.markJobCompleted(jobId, outputFiles, durationMs);
    logger.info('Job completed successfully', { jobId, durationMs, outputFilesCount: outputFiles.length });
  } catch (err: unknown) {
    const errorDetails = {
      message: err instanceof Error ? err.message : String(err),
      code: err instanceof AppError ? err.code : 'PROCESSING_ERROR'
    };
    logger.error('Job processing failed', { jobId, error: errorDetails });
    await jobService.markJobFailed(jobId, errorDetails);
    throw err;
  }
};

export const createDocumentWorker = (): Worker<DocumentJobData> => {
  const connection = getRedisClient();
  const worker = new Worker<DocumentJobData>(
    DOCUMENT_QUEUE_NAME,
    processDocumentJob,
    {
      connection,
      concurrency: 5
    }
  );

  worker.on('completed', (job) => {
    logger.info('Worker finished job', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Worker job failed', { jobId: job?.id, err: err.message });
  });

  return worker;
};
