import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * PDF Templates service (Faz 9).
 *
 * Hem sistem sablonlari (is_system=1, tenant_id NULL — tum tenant'lar gorur)
 * hem tenant-ozel (custom) sablonlari (is_system=0, tenant_id=this tenant).
 *
 * Multi-tenant kural: bir tenant kendi sablonlarini gorur + sistem sablonlarini.
 * Sistem sablonlari SADECE okunur (PATCH/DELETE edilemez).
 *
 * layout_json: NVARCHAR(MAX) icinde JSON.stringify edilmis PdfLayoutConfig.
 * Boylece her sablon kendi layout'unu tasir (renkler, font, kapak tipi,
 * urun karti duzeni, footer stili, vb.). PDF render tarafi bu config'i
 * okuyup uygulayacak (Aşama 3 — pdf.service.ts refactor).
 */

// === Types ===

export interface PdfLayoutConfig {
  pageSize?: 'A4' | 'A5' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  margin?: { top: number; bottom: number; left: number; right: number };
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    text?: string;
    muted?: string;
    background?: string;
  };
  typography?: {
    fontFamily?: string;
    titleSize?: number;
    bodySize?: number;
    captionSize?: number;
  };
  cover?: {
    style?: 'full-image' | 'centered' | 'minimal' | 'magazine' | 'gradient';
    showTitle?: boolean;
    showLogo?: boolean;
    showSubtitle?: boolean;
    overlayOpacity?: number;
  };
  header?: {
    style?: 'simple' | 'bold' | 'minimal' | 'none';
    showLogo?: boolean;
    showTenantName?: boolean;
    showDate?: boolean;
  };
  productCard?: {
    style?: 'list' | 'grid' | 'magazine' | 'compact' | 'detailed';
    columns?: 1 | 2 | 3 | 4;
    imagePosition?: 'top' | 'left' | 'right' | 'background';
    showSku?: boolean;
    showDescription?: boolean;
    showCategory?: boolean;
    showBrand?: boolean;
    showPrice?: boolean;
    imageAspectRatio?: '1:1' | '4:3' | '3:2' | '16:9';
    borderStyle?: 'none' | 'thin' | 'accent' | 'shadow';
  };
  footer?: {
    style?: 'simple' | 'bold' | 'minimal';
    showPageNumbers?: boolean;
    showContact?: boolean;
  };
  tableOfContents?: {
    enabled?: boolean;
    style?: 'simple' | 'numbered' | 'thumbnails';
    groupByCategory?: boolean;
  };
}

export interface PdfTemplateDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  layout: PdfLayoutConfig;
  previewImageBase64: string | null;
  isSystem: boolean;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PdfTemplateInput {
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  layout: PdfLayoutConfig;
  previewImageBase64?: string | null;
}

// === Helpers ===

const rowToDto = (r: Record<string, unknown>): PdfTemplateDTO => {
  let layout: PdfLayoutConfig = {};
  if (typeof r.layout_json === 'string' && r.layout_json.length > 0) {
    try {
      layout = JSON.parse(r.layout_json as string) as PdfLayoutConfig;
    } catch (err) {
      logger.warn({ err, templateId: r.id }, 'pdf_templates layout_json parse hatasi');
    }
  }
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description as string | null) ?? null,
    category: r.category as string,
    layout,
    previewImageBase64: (r.preview_image_base64 as string | null) ?? null,
    isSystem: Boolean(r.is_system),
    tenantId: (r.tenant_id as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
};

// === List ===

export interface ListTemplatesOptions {
  category?: string;
  isSystem?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const listTemplates = async (
  tenantId: string,
  options: ListTemplatesOptions = {},
): Promise<{ items: PdfTemplateDTO[]; total: number; page: number; limit: number }> => {
  const pool = await getPool();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  // Tenant filtresi: (tenant_id IS NULL OR tenant_id = @tenantId)
  // Boylece sistem sablonlari (tenant_id NULL) tum tenant'lar gorur.
  const filters: string[] = ['(pt.tenant_id IS NULL OR pt.tenant_id = @tenantId)'];
  if (options.category) filters.push('pt.category = @category');
  if (options.isSystem !== undefined) filters.push('pt.is_system = @isSystem');
  if (options.search) {
    filters.push('(LOWER(pt.name) LIKE @search OR LOWER(pt.slug) LIKE @search OR LOWER(COALESCE(pt.description, \'\')) LIKE @search)');
  }
  const where = filters.join(' AND ');

  const itemsR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('category', sql.NVarChar, options.category ?? null)
    .input('isSystem', sql.Bit, options.isSystem !== undefined ? (options.isSystem ? 1 : 0) : null)
    .input('search', sql.NVarChar, options.search ? `%${options.search.toLowerCase()}%` : null)
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize)
    .query(`SELECT pt.id, pt.name, pt.slug, pt.description, pt.category, pt.layout_json,
            pt.preview_image_base64, pt.is_system, pt.tenant_id, pt.created_at, pt.updated_at
     FROM pdf_templates pt WHERE ${where}
     ORDER BY pt.is_system DESC, pt.category ASC, pt.name ASC
     OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);

  const totalR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('category', sql.NVarChar, options.category ?? null)
    .input('isSystem', sql.Bit, options.isSystem !== undefined ? (options.isSystem ? 1 : 0) : null)
    .input('search', sql.NVarChar, options.search ? `%${options.search.toLowerCase()}%` : null)
    .query(`SELECT COUNT(*) AS total FROM pdf_templates pt WHERE ${where}`);
  const total = totalR.recordset[0]?.total ?? 0;

  return {
    items: itemsR.recordset.map(rowToDto),
    total,
    page,
    limit: pageSize,
  };
};

// === Get one ===

export const getTemplate = async (tenantId: string, id: string): Promise<PdfTemplateDTO> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT id, name, slug, description, category, layout_json,
            preview_image_base64, is_system, tenant_id, created_at, updated_at
     FROM pdf_templates
     WHERE id = @id AND (tenant_id IS NULL OR tenant_id = @tenantId)`);
  if (!r.recordset[0]) throw new HttpError(404, 'Sablon bulunamadi');
  return rowToDto(r.recordset[0]);
};

// === Create custom template ===

export const createTemplate = async (
  tenantId: string,
  userId: string | null,
  input: PdfTemplateInput,
): Promise<PdfTemplateDTO> => {
  const pool = await getPool();

  // Slug benzersiz mi? (tenant icinde + global sistem slug'lariyla cakisma kontrolu)
  // Sistem sablonlari tenant_id NULL oldugu icin globaldir; custom sablon slug'u
  // bunlarla cakisirsa karisiklik olur. Bu yuzden tenant_id NULL veya tenant bazli
  // kontrol yapalim: ayni (slug, tenant_id) ikilisi unique olmali (UNIQUE INDEX
  // yok ama kontrol manual).
  const existsR = await pool.request()
    .input('slug', sql.VarChar, input.slug)
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT id FROM pdf_templates
            WHERE slug = @slug AND (tenant_id IS NULL OR tenant_id = @tenantId)`);
  if (existsR.recordset[0]) {
    throw new HttpError(409, 'Bu slug zaten kullaniliyor (sistem veya kendi sablonunuz)');
  }

  const layoutJson = JSON.stringify(input.layout);
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('name', sql.NVarChar, input.name)
    .input('slug', sql.VarChar, input.slug)
    .input('description', sql.NVarChar, input.description ?? null)
    .input('category', sql.VarChar, input.category ?? 'custom')
    .input('layoutJson', sql.NVarChar, layoutJson)
    .input('preview', sql.NVarChar, input.previewImageBase64 ?? null)
    .query(`INSERT INTO pdf_templates (tenant_id, name, slug, description, category, layout_json, preview_image_base64, is_system)
            OUTPUT INSERTED.id
            VALUES (@tenantId, @name, @slug, @description, @category, @layoutJson, @preview, 0)`);
  const templateId = r.recordset[0].id;
  logger.info({ templateId, tenantId, userId }, 'Custom PDF sablonu olusturuldu');
  return getTemplate(tenantId, templateId);
};

// === Update custom template (sistem sablonlari degistirilemez) ===

export const updateTemplate = async (
  tenantId: string,
  id: string,
  input: Partial<PdfTemplateInput>,
): Promise<PdfTemplateDTO> => {
  const pool = await getPool();

  // Once mevcut kayit (tenant filtresiyle)
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT id, is_system FROM pdf_templates
            WHERE id = @id AND (tenant_id IS NULL OR tenant_id = @tenantId)`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Sablon bulunamadi');
  if (ex.recordset[0].is_system) {
    throw new HttpError(403, 'Sistem sablonlari degistirilemez. Kopyalayip custom olarak kaydedin.');
  }

  // Slug degisiyorsa cakisma kontrolu
  if (input.slug) {
    const dupR = await pool.request()
      .input('slug', sql.VarChar, input.slug)
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('id', sql.UniqueIdentifier, id)
      .query(`SELECT id FROM pdf_templates
              WHERE slug = @slug AND id <> @id
                AND (tenant_id IS NULL OR tenant_id = @tenantId)`);
    if (dupR.recordset[0]) {
      throw new HttpError(409, 'Bu slug baska bir sablon tarafindan kullaniliyor');
    }
  }

  await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('name', sql.NVarChar, input.name ?? null)
    .input('slug', sql.VarChar, input.slug ?? null)
    .input('description', sql.NVarChar, input.description ?? null)
    .input('category', sql.VarChar, input.category ?? null)
    .input('layoutJson', sql.NVarChar, input.layout ? JSON.stringify(input.layout) : null)
    .input('preview', sql.NVarChar, input.previewImageBase64 ?? null)
    .query(`UPDATE pdf_templates
            SET name         = COALESCE(@name, name),
                slug         = COALESCE(@slug, slug),
                description  = COALESCE(@description, description),
                category     = COALESCE(@category, category),
                layout_json  = COALESCE(@layoutJson, layout_json),
                preview_image_base64 = COALESCE(@preview, preview_image_base64),
                updated_at   = getdate()
            WHERE id = @id AND tenant_id = @tenantId`);

  return getTemplate(tenantId, id);
};

// === Delete custom template (sistem sablonlari silinemez) ===

export const deleteTemplate = async (tenantId: string, id: string): Promise<void> => {
  const pool = await getPool();

  // Once mevcut + tenant filtresi
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT id, is_system FROM pdf_templates
            WHERE id = @id AND (tenant_id IS NULL OR tenant_id = @tenantId)`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Sablon bulunamadi');
  if (ex.recordset[0].is_system) {
    throw new HttpError(403, 'Sistem sablonlari silinemez');
  }

  const r = await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`DELETE FROM pdf_templates
            WHERE id = @id AND tenant_id = @tenantId AND is_system = 0`);
  if (r.rowsAffected[0] === 0) {
    throw new HttpError(500, 'Silme basarisiz (izin veya tenant filtresi sorunu)');
  }
  logger.info({ templateId: id, tenantId }, 'Custom PDF sablonu silindi');
};

// === Upsert (seed icin) ===
// tenant_id NULL olan sistem sablonlari icin. Slug bazli upsert yapar
// (yoksa insert, varsa update). Production'da admin panelinden degil
// sadece seed script'inden cagrilir.

export const upsertSystemTemplate = async (
  input: PdfTemplateInput & { isSystem?: boolean; tenantId?: string | null },
): Promise<void> => {
  const pool = await getPool();
  const layoutJson = JSON.stringify(input.layout);
  await pool.request()
    .input('tenantId', sql.UniqueIdentifier, input.tenantId ?? null)
    .input('name', sql.NVarChar, input.name)
    .input('slug', sql.VarChar, input.slug)
    .input('description', sql.NVarChar, input.description ?? null)
    .input('category', sql.VarChar, input.category ?? 'classic')
    .input('layoutJson', sql.NVarChar, layoutJson)
    .input('preview', sql.NVarChar, input.previewImageBase64 ?? null)
    .input('isSystem', sql.Bit, input.isSystem === false ? 0 : 1)
    .query(`IF EXISTS (SELECT 1 FROM pdf_templates WHERE slug = @slug AND (tenant_id IS NULL OR tenant_id = @tenantId))
            BEGIN
              UPDATE pdf_templates
              SET name = @name, slug = @slug, description = @description,
                  category = @category, layout_json = @layoutJson,
                  preview_image_base64 = @preview, is_system = @isSystem,
                  updated_at = getdate()
              WHERE slug = @slug AND (tenant_id IS NULL OR tenant_id = @tenantId)
            END
            ELSE
            BEGIN
              INSERT INTO pdf_templates (tenant_id, name, slug, description, category, layout_json, preview_image_base64, is_system)
              VALUES (@tenantId, @name, @slug, @description, @category, @layoutJson, @preview, @isSystem)
            END`);
};
