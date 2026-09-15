/**
 * Import service (STUB - Drizzle ORM'den raw mssql'e gecildi).
 *
 * Excel/XML import ileride yeniden implement edilecek.
 */

import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface ImportResult {
  inserted: number;
  updated: number;
  errors: Array<{ row: number; message: string }>;
}

export const importFromExcel = async (): Promise<ImportResult> => {
  throw new HttpError(501, 'importFromExcel henuz implement edilmedi (Drizzle->raw mssql gecisi sirasinda)');
};

export const importFromXml = async (): Promise<ImportResult> => {
  throw new HttpError(501, 'importFromXml henuz implement edilmedi');
};

logger.info('import.service.ts (stub) yuklendi');