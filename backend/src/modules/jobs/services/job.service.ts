import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { JobModel, IJob, JobStatus, IJobInputFile, IJobOutputFile } from '../models/job.model.js';
import { NotFoundError, ForbiddenError } from '../../../utils/errors.js';
import { createChildLogger } from '../../../utils/logger.js';
import { config } from '../../../config/index.js';
import { isDatabaseHealthy } from '../../../config/database.js';

const logger = createChildLogger('JobService');

// Fallback in-memory cache for fast access and test runs
const inMemoryJobs = new Map<string, Partial<IJob>>();

export class JobService {
  public async createJob(params: {
    tool: string;
    userId?: string;
    isGuest: boolean;
    guestIp?: string;
    inputFiles: IJobInputFile[];
    parameters?: Record<string, unknown>;
  }): Promise<IJob | Partial<IJob>> {
    const jobId = uuidv4();
    const expiresAt = new Date(Date.now() + config.FILE_RETENTION_HOURS * 60 * 60 * 1000);

    const jobData: Partial<IJob> = {
      jobId,
      userId: params.userId ? new mongoose.Types.ObjectId(params.userId) : undefined,
      isGuest: params.isGuest,
      guestIp: params.guestIp,
      tool: params.tool,
      status: 'queued' as JobStatus,
      progress: 0,
      inputFiles: params.inputFiles,
      outputFiles: [],
      parameters: params.parameters || {},
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    inMemoryJobs.set(jobId, jobData);

    if (isDatabaseHealthy()) {
      try {
        const doc = await JobModel.create(jobData);
        return doc;
      } catch (err) {
        logger.warn('Failed to persist job to Mongo, stored in-memory', { jobId, err });
      }
    }

    return jobData;
  }

  public async getJobById(jobId: string, requestUser?: { id?: string; ip?: string }): Promise<IJob | Partial<IJob>> {
    let job: IJob | Partial<IJob> | null = null;

    if (isDatabaseHealthy()) {
      try {
        job = (await JobModel.findOne({ jobId })) as unknown as IJob | null;
      } catch (err) {
        logger.warn('Error reading job from database, falling back to memory', { jobId, err });
      }
    }

    if (!job) {
      job = inMemoryJobs.get(jobId) || null;
    }

    if (!job) {
      throw new NotFoundError(`Job not found: ${jobId}`);
    }

    // Ownership check: if job has userId, verify caller
    if (job.userId && requestUser?.id) {
      if (job.userId.toString() !== requestUser.id) {
        throw new ForbiddenError('You do not have access to this job');
      }
    }

    return job;
  }

  public async updateJobProgress(jobId: string, progress: number, status: JobStatus = 'processing'): Promise<void> {
    const memJob = inMemoryJobs.get(jobId);
    if (memJob) {
      memJob.progress = progress;
      memJob.status = status;
      if (status === 'processing' && !memJob.startedAt) {
        memJob.startedAt = new Date();
      }
      memJob.updatedAt = new Date();
    }

    if (isDatabaseHealthy()) {
      try {
        await JobModel.updateOne(
          { jobId },
          {
            $set: {
              progress,
              status,
              updatedAt: new Date(),
              ...(status === 'processing' ? { startedAt: new Date() } : {})
            }
          }
        );
      } catch (err) {
        logger.warn('Failed to update job progress in DB', { jobId, err });
      }
    }
  }

  public async markJobCompleted(
    jobId: string,
    outputFiles: IJobOutputFile[],
    durationMs?: number
  ): Promise<void> {
    const memJob = inMemoryJobs.get(jobId);
    const now = new Date();
    if (memJob) {
      memJob.status = 'completed';
      memJob.progress = 100;
      memJob.outputFiles = outputFiles;
      memJob.completedAt = now;
      memJob.durationMs = durationMs;
      memJob.updatedAt = now;
    }

    if (isDatabaseHealthy()) {
      try {
        await JobModel.updateOne(
          { jobId },
          {
            $set: {
              status: 'completed',
              progress: 100,
              outputFiles,
              completedAt: now,
              durationMs,
              updatedAt: now
            }
          }
        );
      } catch (err) {
        logger.warn('Failed to mark job completed in DB', { jobId, err });
      }
    }
  }

  public async markJobFailed(
    jobId: string,
    error: { message: string; code: string; details?: unknown }
  ): Promise<void> {
    const memJob = inMemoryJobs.get(jobId);
    const now = new Date();
    if (memJob) {
      memJob.status = 'failed';
      memJob.error = error;
      memJob.completedAt = now;
      memJob.updatedAt = now;
    }

    if (isDatabaseHealthy()) {
      try {
        await JobModel.updateOne(
          { jobId },
          {
            $set: {
              status: 'failed',
              error,
              completedAt: now,
              updatedAt: now
            }
          }
        );
      } catch (err) {
        logger.warn('Failed to mark job failed in DB', { jobId, err });
      }
    }
  }

  public async getUserJobHistory(userId: string, limit = 20): Promise<IJob[]> {
    if (isDatabaseHealthy()) {
      return JobModel.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean() as unknown as IJob[];
    }
    const userJobs = Array.from(inMemoryJobs.values()).filter(
      (j) => j.userId && j.userId.toString() === userId
    );
    return userJobs.slice(0, limit) as unknown as IJob[];
  }
}

export const jobService = new JobService();
