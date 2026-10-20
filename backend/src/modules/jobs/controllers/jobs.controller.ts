import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fsSync from 'fs';
import { jobService } from '../services/job.service.js';
import { storageService } from '../../../services/storage.service.js';
import { NotFoundError, ForbiddenError, AppError } from '../../../utils/errors.js';

export class JobsController {
  public getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = String(req.params.jobId);
      const job = await jobService.getJobById(jobId, {
        id: req.user?.id,
        ip: req.guestIp
      });

      const details = {
        jobId: job.jobId,
        tool: job.tool,
        status: job.status,
        progress: job.progress,
        outputFiles: job.outputFiles,
        error: job.error,
        durationMs: job.durationMs,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        downloadUrl: job.status === 'completed' ? `/api/jobs/${job.jobId}/download` : undefined
      };

      res.status(200).json({
        success: true,
        ...details,
        data: details
      });
    } catch (err) {
      next(err);
    }
  };

  public downloadResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = String(req.params.jobId);
      const fileId = req.params.fileId ? String(req.params.fileId) : undefined;
      const job = await jobService.getJobById(jobId, {
        id: req.user?.id,
        ip: req.guestIp
      });

      if (job.status !== 'completed' || !job.outputFiles || job.outputFiles.length === 0) {
        throw new AppError('Job result is not yet completed or has no output files', 400);
      }

      let targetFile = job.outputFiles[0];
      if (fileId) {
        const found = job.outputFiles.find((f) => f.fileId === fileId);
        if (found) targetFile = found;
      }

      if (!fsSync.existsSync(targetFile.path)) {
        throw new NotFoundError('Output file has expired or was removed from storage');
      }

      res.setHeader('Content-Type', targetFile.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(targetFile.originalName)}"`
      );
      res.setHeader('Content-Length', targetFile.size);

      const fileStream = storageService.getFileStream(targetFile.path);
      fileStream.pipe(res);
    } catch (err) {
      next(err);
    }
  };
}

export const jobsController = new JobsController();
