import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  DEFAULT_LAYOUT,
  mergeLayoutWithDefaults,
} from './pdfLayoutDefaults';
import type { PdfLayoutConfig } from './pdfTemplates.service';

/**
 * PDF Template resolver (Faz 9.3.1).
 *
 * generateCatalogPdf(templateId?) cagirildiginda:
 *   - templateId yoksa       → DEFAULT_LAYOUT kullanilir (template=null)
 *   - templateId varsa       → DB'den layout JSON parse edilir, default ile merge
 *   - templateId bulunamazsa → 404 (catalogPdfSettings.template_id icin tutarli)
 *
 * Tenant filtresi: (tenant_id IS NULL OR tenant_id = @tenantId).
 * Sistem preset'leri her tenant icin kullanilabilir.
 */

export interface ResolvedTemplate {
  templateId: string | null;
  templateSlug: string | null;
  templateName: string | null;
  layout: ReturnType<typeof mergeLayoutWithDefaults>;
}

export const resolveTemplate = async (
  tenantId: string,
  templateId: string | null | undefined,
): Promise<ResolvedTemplate> => {
  if (!templateId) {
    return {
      templateId: null,
      templateSlug: null,
      templateName: null,
      layout: DEFAULT_LAYOUT,
    };
  }

  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('templateId', sql.UniqueIdentifier, templateId)
    .query(`SELECT id, name, slug, layout_json
            FROM pdf_templates
            WHERE id = @templateId
              AND (tenant_id IS NULL OR tenant_id = @tenantId)`);

  const row = r.recordset[0];
  if (!row) {
    throw new HttpError(404, 'PDF sablonu bulunamadi');
  }

  let parsed: PdfLayoutConfig = {};
  if (typeof row.layout_json === 'string' && row.layout_json.length > 0) {
    try {
      parsed = JSON.parse(row.layout_json) as PdfLayoutConfig;
    } catch (err) {
      logger.warn(
        { templateId, err: (err as Error).message },
        'resolveTemplate: layout_json parse hatasi, default kullaniliyor',
      );
    }
  }

  return {
    templateId: row.id,
    templateSlug: row.slug,
    templateName: row.name,
    layout: mergeLayoutWithDefaults(parsed),
  };
};
