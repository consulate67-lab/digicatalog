import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import categoryRouter from './routes/categories';
import productRouter from './routes/products';
import customerRouter from './routes/customers';
import importRouter from './routes/import';

/**
 * Express app factory. Tüm middleware + route registry burada.
 * server.ts bunu çağırır, listen eder.
 *
 * Mimari:
 *   app.ts        → factory (middleware + routes + errorHandler)
 *   server.ts     → bootstrap (listen, graceful shutdown, DB pool)
 *   routes/       → domain route modülleri (health, auth, products, ...)
 *   middleware/   → cross-cutting concerns (auth, tenant, errorHandler)
 *   services/     → iş mantığı (Faz 1'den itibaren)
 */
export const createApp = (): Application => {
  const app = express();

  // === Güvenlik ===
  app.use(helmet());

  // === CORS ===
  app.use(
    cors({
      origin: (origin, callback) => {
        // Postman/curl gibi origin'siz isteklere izin ver (dev/test)
        if (!origin) return callback(null, true);

        if (env.ALLOWED_ORIGINS.includes('*') || env.ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`CORS: origin '${origin}' not allowed`));
      },
      credentials: true,
    }),
  );

  // === Body parsing ===
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // === Raw body parser for XML imports ===
  // /api/products/import/xml accepts both multipart and raw text/xml.
  // Multer handles multipart, raw body needs explicit content-type.
  app.use('/api/products/import/xml', express.text({ type: ['text/xml', 'application/xml'], limit: '10mb' }));

  // === Request logging ===
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // === Routes ===
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoryRouter);
  app.use('/api/products', productRouter);
  app.use('/api/customers', customerRouter);
  app.use('/api/products/import', importRouter);
  app.use('/api/customers/import', importRouter);

  // === 404 handler ===
  app.use((req, res) => {
    res.status(404).json({
      error: 'NotFound',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // === Global error handler (en son) ===
  app.use(errorHandler);

  return app;
};
