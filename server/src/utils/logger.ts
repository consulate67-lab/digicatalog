import pino from 'pino';
import { env } from '../config/env';

/**
 * Yapısal loglama (JSON format, production-ready).
 *
 * - Development: pretty-printed, renkli, okunabilir
 * - Production: JSON, log aggregator (Railway, Datadog, vb.) için optimize
 *
 * Kullanım:
 *   import { logger } from '../utils/logger';
 *   logger.info({ userId, tenantId }, 'User logged in');
 *   logger.error({ err }, 'Database query failed');
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'digicatalog-backend',
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,service,env',
          },
        },
      }
    : {}),
});
