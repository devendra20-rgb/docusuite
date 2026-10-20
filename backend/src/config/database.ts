import mongoose from 'mongoose';
import { config } from './index.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('Database');

let isConnected = false;

export const connectDatabase = async (): Promise<typeof mongoose | null> => {
  if (config.NODE_ENV === 'test') {
    // Tests will manage their own connection or mock
    return null;
  }

  try {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      isConnected = false;
      logger.error('MongoDB connection error', { err });
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });

    const conn = await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: config.NODE_ENV !== 'production'
    });

    return conn;
  } catch (err) {
    logger.error('Failed to connect to MongoDB', { uri: config.MONGODB_URI, err });
    // In dev mode allow starting even if Mongo is not running yet
    if (config.NODE_ENV === 'production') {
      throw err;
    }
    return null;
  }
};

export const isDatabaseHealthy = (): boolean => {
  return isConnected || mongoose.connection.readyState === 1;
};

export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected cleanly');
  }
};
