import mongoose, { Document, Schema } from 'mongoose';

export interface IFile extends Document {
  fileId: string;
  userId?: mongoose.Types.ObjectId;
  isGuest: boolean;
  guestIp?: string;
  originalName: string;
  filename: string;
  storedPath: string;
  mimeType: string;
  size: number;
  pageCount?: number;
  createdAt: Date;
  expiresAt: Date;
}

const fileSchema = new Schema<IFile>(
  {
    fileId: {
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
    originalName: {
      type: String,
      required: true
    },
    filename: {
      type: String,
      required: true
    },
    storedPath: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    pageCount: {
      type: Number
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '1s' } // TTL index for automatic expiration in Mongo
    }
  },
  {
    timestamps: true
  }
);

export const FileModel = mongoose.model<IFile>('File', fileSchema);
