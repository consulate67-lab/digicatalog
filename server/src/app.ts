import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
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
import integrationsRouter from './routes/integrations';
import catalogRouter from './routes/catalogs';
import viewerRouter from './routes/viewer';
import pdfRouter from './routes/pdf';

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

  // === Guvenlik ===
  // Helmet: HTTP security header'lari (CSP, HSTS, X-Frame-Options, vs.)
  // contentSecurityPolicy siki tutulmuyor cunku image src data: gerekli
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // === Rate limiting (auth + import endpoint'leri icin) ===
  // Brute force saldirilarini onlemek icin
  const authRateLimiter = rateLimit({
    windowMs: 60_000, // 1 dakika
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TooManyRequests', message: 'Cok fazla istek, lutfen bekleyin' },
  });
  const importRateLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TooManyRequests', message: 'Cok fazla import istegi' },
  });

  // === Trust proxy (Railway arkasinda calismak icin) ===
  app.set('trust proxy', 1);

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
  // Auth + import rate limit (brute force koruma)
  app.use('/api/auth/login', authRateLimiter);
  app.use('/api/auth/register', authRateLimiter);
  app.use('/api/auth/refresh', authRateLimiter);
  app.use('/api/products/import', importRateLimiter);
  app.use('/api/customers/import', importRateLimiter);

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoryRouter);
  app.use('/api/products', productRouter);
  app.use('/api/customers', customerRouter);
  app.use('/api/products/import', importRouter);
  app.use('/api/customers/import', importRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/catalogs', catalogRouter);

  // === Public viewer (no auth) ===
  // ONEMLI: pdfRouter'dan ONCE mount edilmeli. pdfRouter /api/*'a
  // global authMiddleware uyguladigi icin, sonra gelen viewer da
  // 401'le reddedilirdi. Viewer public oldugundan router disina
  // auth koyamiyoruz, bu yuzden mount sirasi onemli.
  app.use('/api/viewer', viewerRouter);

  app.use('/api', pdfRouter);

  // === Static client build (production) ===
  if (env.NODE_ENV === 'production') {
    const publicDir = path.join(__dirname, '..', 'public');
    if (fs.existsSync(publicDir)) {
      // Hashed asset'ler (assets/*) uzun sure cache'lenebilir —
      // dosya adi hash icerigi temsil eder, degismez.
      app.use(
        '/assets',
        express.static(path.join(publicDir, 'assets'), {
          maxAge: '1y',
          immutable: true,
        }),
      );
      // Diger statik dosyalar (favicon, vs.) — kisa cache
      app.use(
        express.static(publicDir, {
          maxAge: '1h',
        }),
      );
      // SPA fallback — /api/* haricindeki GET isteklerine index.html
      // no-cache ile ki yeni deploy'larda browser eski HTML'i tutmasin.
      app.get(/^(?!\/api).*/, (_req, res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.sendFile(path.join(publicDir, 'index.html'));
      });
    } else {
      logger.warn('server/public bulunamadi - `npm run build` calistirin.');
    }
  }

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
