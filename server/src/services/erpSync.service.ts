/**
 * ERP Sync service (STUB - Drizzle ORM'den raw mssql'e gecildi).
 *
 * KorgunMssqlAdapter zaten raw mssql ile yazilmis (Faz 4) — bagimsiz.
 * Sync orchestration (products, customers) ileride yeniden yazilacak.
 */

import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface SyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ sku?: string; customerId?: string; message: string }>;
}

export const syncProductsFromErp = async (): Promise<SyncResult> => {
  throw new HttpError(501, 'syncProductsFromErp henuz implement edilmedi (Drizzle->raw mssql gecisi sirasinda)');
};

export const syncCustomersFromErp = async (): Promise<SyncResult> => {
  throw new HttpError(501, 'syncCustomersFromErp henuz implement edilmedi');
};

export const testErpConnection = async (): Promise<{ ok: boolean; message: string }> => {
  throw new HttpError(501, 'testErpConnection henuz implement edilmedi');
};

logger.info('erpSync.service.ts (stub) yuklendi');