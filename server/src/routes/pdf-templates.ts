import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import * as pdfTemplatesService from '../services/pdfTemplates.service';
import { HttpError } from '../middleware/errorHandler';
import { paginated } from '../utils/pagination';

/**
 * Admin PDF Templates endpoint'leri.
 *
 * Mount: app.use('/api/admin/pdf-templates', pdfTemplatesRouter)
 *
 * Not: Auth zorunlu (admin). RBAC (super_admin / tenant_admin) henuz yok —
 * login olan her kullanici kendi tenant'inin custom sablonlarini yonetir.
 * Faz 10'da role-based middleware eklenebilir.
 */

const router = Router();
router.use(authMiddleware);

// === Validation ===

const layoutConfigSchema = z.object({
  pageSize: z.enum(['A4', 'A5', 'Letter']).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  margin: z
    .object({
      top: z.number().min(0).max(200).optional(),
      bottom: z.number().min(0).max(200).optional(),
      left: z.number().min(0).max(200).optional(),
      right: z.number().min(0).max(200).optional(),
    })
    .optional(),
  colors: z
    .object({
      primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      text: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      muted: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      background: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    })
    .optional(),
  typography: z
    .object({
      fontFamily: z.string().max(100).optional(),
      titleSize: z.number().min(8).max(96).optional(),
      bodySize: z.number().min(6).max(48).optional(),
      captionSize: z.number().min(6).max(32).optional(),
    })
    .optional(),
  cover: z
    .object({
      style: z.enum(['full-image', 'centered', 'minimal', 'magazine', 'gradient']).optional(),
      showTitle: z.boolean().optional(),
      showLogo: z.boolean().optional(),
      showSubtitle: z.boolean().optional(),
      overlayOpacity: z.number().min(0).max(1).optional(),
    })
    .optional(),
  header: z
    .object({
      style: z.enum(['simple', 'bold', 'minimal', 'none']).optional(),
      showLogo: z.boolean().optional(),
      showTenantName: z.boolean().optional(),
      showDate: z.boolean().optional(),
    })
    .optional(),
  productCard: z
    .object({
      style: z.enum(['list', 'grid', 'magazine', 'compact', 'detailed']).optional(),
      columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
      imagePosition: z.enum(['top', 'left', 'right', 'background']).optional(),
      showSku: z.boolean().optional(),
      showDescription: z.boolean().optional(),
      showCategory: z.boolean().optional(),
      showBrand: z.boolean().optional(),
      showPrice: z.boolean().optional(),
      imageAspectRatio: z.enum(['1:1', '4:3', '3:2', '16:9']).optional(),
      borderStyle: z.enum(['none', 'thin', 'accent', 'shadow']).optional(),
    })
    .optional(),
  footer: z
    .object({
      style: z.enum(['simple', 'bold', 'minimal']).optional(),
      showPageNumbers: z.boolean().optional(),
      showContact: z.boolean().optional(),
    })
    .optional(),
  tableOfContents: z
    .object({
      enabled: z.boolean().optional(),
      style: z.enum(['simple', 'numbered', 'thumbnails']).optional(),
      groupByCategory: z.boolean().optional(),
    })
    .optional(),
});

// layout objesi zorunlu CREATE'de, PATCH'ta partial olabilir
const layoutConfigPartial = layoutConfigSchema.partial();

const listQuerySchema = z.object({
  category: z.string().min(1).max(50).optional(),
  isSystem: z.enum(['true', 'false']).optional(),
  search: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'slug sadece kucuk harf, rakam ve tire icerebilir'),
  description: z.string().max(500).nullable().optional(),
  category: z.string().min(1).max(50).optional(),
  layout: layoutConfigSchema,
  previewImageBase64: z.string().max(10_000_000).nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.string().min(1).max(50).optional(),
  layout: layoutConfigPartial.optional(),
  previewImageBase64: z.string().max(10_000_000).nullable().optional(),
});

// === Routes ===

/**
 * GET /api/admin/pdf-templates
 * Query: category, isSystem, search, page, pageSize
 * Pagination'li liste. Tenant filtresi: (sistem + bu tenant) gorulur.
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const q = listQuerySchema.parse(req.query);
    const result = await pdfTemplatesService.listTemplates(req.user.tenantId, {
      category: q.category,
      isSystem: q.isSystem === 'true' ? true : q.isSystem === 'false' ? false : undefined,
      search: q.search,
      page: q.page,
      pageSize: q.pageSize,
    });
    res.json(paginated(result.items, result.total, result.page, result.limit));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/pdf-templates/:id
 * Tek sablon detay. Sistem + bu tenant'a ait olanlar gorulebilir.
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const template = await pdfTemplatesService.getTemplate(req.user.tenantId, req.params.id);
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/pdf-templates
 * Body: { name, slug, description?, category?, layout, previewImageBase64? }
 * Custom sablon olusturur (tenant_id = this tenant, is_system = 0).
 */
router.post('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = createSchema.parse(req.body);
    const template = await pdfTemplatesService.createTemplate(req.user.tenantId, req.user.id, input);
    res.status(201).json({ data: template });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/pdf-templates/:id
 * Body: partial fields (name?, slug?, description?, layout?, ...)
 * Sadece custom sablonlar (sistem degil) guncellenebilir.
 */
router.patch('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = updateSchema.parse(req.body);
    const template = await pdfTemplatesService.updateTemplate(
      req.user.tenantId,
      req.params.id,
      input,
    );
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/pdf-templates/:id
 * Sadece custom sablonlar (sistem degil) silinebilir.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await pdfTemplatesService.deleteTemplate(req.user.tenantId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
