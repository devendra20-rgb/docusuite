import mongoose, { Document, Schema } from 'mongoose';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface IJobInputFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
}

export interface IJobOutputFile {
  fileId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  downloadUrl: string;
}

export interface IJob extends Document {
  jobId: string;
  userId?: mongoose.Types.ObjectId;
  isGuest: boolean;
  guestIp?: string;
  tool: string;
  status: JobStatus;
  progress: number;
  inputFiles: IJobInputFile[];
  outputFiles: IJobOutputFile[];
  parameters: Record<string, unknown>;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
  durationMs?: number;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    isGuest: {
      type: Boolean,
      default: false
    },
    guestIp: {
      type: String
    },
    tool: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true
    },
    progress: {
      type: Number,
      default: 0
    },
    inputFiles: [
      {
        fileId: String,
        originalName: String,
        mimeType: String,
        size: Number,
        path: String
      }
    ],
    outputFiles: [
      {
        fileId: String,
        filename: String,
        originalName: String,
        mimeType: String,
        size: Number,
        path: String,
        downloadUrl: String
      }
    ],
    parameters: {
      type: Schema.Types.Mixed,
      default: {}
    },
    error: {
      message: String,
      code: String,
      details: Schema.Types.Mixed
    },
    durationMs: {
      type: Number
    },
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '1s' }
    }
  },
  {
    timestamps: true
  }
);

export const JobModel = mongoose.model<IJob>('Job', jobSchema);
