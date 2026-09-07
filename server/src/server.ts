import { createApp } from './app';
import { closePool, pool } from './config/database';
import { env } from './config/env';
import { logger } from './utils/logger';

const app = createApp();

/**
 * Server bootstrap. Express app'i dinler, graceful shutdown yönetir.
 *
 * Faz 0'da DB bağlantısı opsiyonel (DB hazır değilse de server ayağa kalksın).
 * Faz 1'den itibaren startup'ta migration çalıştırılacak.
 */
export const startServer = (): void => {
  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        origins: env.ALLOWED_ORIGINS.join(', '),
        db: env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'), // şifre maskeleme
      },
      `🚀 DijiCatalog backend running on port ${env.PORT}`,
    );
  });

  // === Graceful shutdown ===
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down server...');

    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await closePool();
        logger.info('Database pool closed');
      } catch (err) {
        logger.error({ err }, 'Error closing database pool');
      }
      process.exit(0);
    });

    // 10s sonra zorla kapat
    setTimeout(() => {
      logger.error('Forced shutdown after 10s timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'UNCAUGHT EXCEPTION');
  });

  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'UNHANDLED REJECTION');
  });

  // Pool hataları (örn. idle bağlantı kopması)
  pool.on('error', (err) => {
    logger.error({ err }, 'PostgreSQL pool error');
  });

  return undefined;
};
