import { Queue, JobsOptions } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('DocumentQueue');

export const DOCUMENT_QUEUE_NAME = 'document-processing';

export interface DocumentJobData {
  jobId: string;
  tool: string;
  operation: string;
  userId?: string;
  isGuest: boolean;
  guestIp?: string;
  inputFiles: {
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    path: string;
  }[];
  parameters?: Record<string, unknown>;
}

let documentQueue: Queue<DocumentJobData> | null = null;

export const getDocumentQueue = (): Queue<DocumentJobData> => {
  if (documentQueue) {
    return documentQueue;
  }

  const connection = getRedisClient();

  documentQueue = new Queue<DocumentJobData>(DOCUMENT_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: {
        age: config.FILE_RETENTION_HOURS * 3600,
        count: 1000
      },
      removeOnFail: {
        age: config.FILE_RETENTION_HOURS * 3600,
        count: 1000
      }
    }
  });

  documentQueue.on('error', (err) => {
    logger.warn('Document queue error', { err: err.message });
  });

  return documentQueue;
};

export const enqueueDocumentJob = async (
  data: DocumentJobData,
  opts?: JobsOptions
): Promise<string> => {
  try {
    const queue = getDocumentQueue();
    const job = await queue.add(data.operation, data, {
      jobId: data.jobId,
      ...opts
    });
    logger.info('Enqueued background job', { jobId: data.jobId, operation: data.operation });
    return job.id as string;
  } catch (err) {
    logger.warn('Failed to enqueue to Redis/BullMQ. Operation will run synchronously or in-memory fallback', {
      jobId: data.jobId,
      err: (err as Error).message
    });
    return data.jobId;
  }
};

export const closeDocumentQueue = async (): Promise<void> => {
  if (documentQueue) {
    await documentQueue.close();
    documentQueue = null;
    logger.info('Document queue closed');
  }
};
