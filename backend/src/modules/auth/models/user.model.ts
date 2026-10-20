import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name?: string;
  role: 'user' | 'admin';
  dailyJobsUsed: number;
  lastJobReset: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    name: {
      type: String,
      trim: true
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    dailyJobsUsed: {
      type: Number,
      default: 0
    },
    lastJobReset: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

export const UserModel = mongoose.model<IUser>('User', userSchema);
