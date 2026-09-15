/**
 * PDF service (STUB - Drizzle ORM'den raw mssql'e gecildi).
 *
 * PDF generation ileride yeniden implement edilecek (raw mssql + pdfkit).
 * Simdilik tum PDF endpoint'leri 501 Not Implemented doner.
 */

import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const generateCatalogPdf = async (): Promise<never> => {
  throw new HttpError(501, 'generateCatalogPdf henuz implement edilmedi (Drizzle->raw mssql gecisi sirasinda)');
};

export const generateProductPdf = async (): Promise<never> => {
  throw new HttpError(501, 'generateProductPdf henuz implement edilmedi');
};

export const generatePdfStream = async (): Promise<never> => {
  throw new HttpError(501, 'generatePdfStream henuz implement edilmedi');
};

logger.info('pdf.service.ts (stub) yuklendi');