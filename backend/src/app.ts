import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { pinoHttp } from 'pino-http';
import { config } from './config/index.js';
import { logger, rawLoggerInstance } from './utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { openApiSpec } from './docs/openapi.js';

// Route imports
import healthRoutes from './routes/health.routes.js';
import authRoutes from './modules/auth/routes/auth.routes.js';
import pdfToolsRoutes from './modules/pdf-tools/routes/pdf-tools.routes.js';
import conversionsRoutes from './modules/conversions/routes/conversions.routes.js';
import jobsRoutes from './modules/jobs/routes/jobs.routes.js';

export const createApp = (): Express => {
  const app = express();

  // Trust reverse proxies (e.g. Nginx, Docker host)
  app.set('trust proxy', 1);

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows Swagger UI to render smoothly
      crossOriginEmbedderPolicy: false
    })
  );

  // CORS
  app.use(
    cors({
      origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    })
  );

  // HTTP Logging
  if (config.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger: rawLoggerInstance,
        autoLogging: {
          ignore: (req) => req.url?.includes('/health') || req.url?.includes('/ready')
        }
      })
    );
  }

  // Body Parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API Documentation (Swagger / OpenAPI 3.0)
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/api/docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(openApiSpec);
  });

  // Base API Router
  const apiRouter = express.Router();

  apiRouter.use('/', healthRoutes);
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/tools', pdfToolsRoutes);
  apiRouter.use('/tools/convert', conversionsRoutes);
  apiRouter.use('/jobs', jobsRoutes);

  app.use(config.API_PREFIX, apiRouter);

  // 404 Route Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route not found: ${req.method} ${req.originalUrl}`
      }
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
};

export default createApp;
