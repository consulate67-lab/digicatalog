import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import * as catalogService from '../services/catalog.service';
import { CATALOG_FIELD_NAMES } from '../db/schema/catalogFieldConfig';
import { HttpError } from '../middleware/errorHandler';

const router = Router();
router.use(authMiddleware);

// === Validation ===

const listQuerySchema = z.object({
  status: z.enum(['draft', 'active', 'archived']).optional(),
  search: z.string().min(1).max(200).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

const updateSchema = createSchema.partial();

const assignCustomersSchema = z.object({
  customerIds: z.array(z.string().uuid()).min(1).max(500),
});

const addItemSchema = z.object({
  productId: z.string().uuid(),
  customPrice: z.number().nonnegative().nullable().optional(),
  customNotes: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const fieldConfigSchema = z.object({
  fields: z
    .array(
      z.object({
        fieldName: z.enum(CATALOG_FIELD_NAMES as unknown as [string, ...string[]]),
        isVisible: z.boolean(),
        sortOrder: z.number().int(),
      }),
    )
    .min(1)
    .max(20),
});

const filterQuerySchema = z.object({
  search: z.string().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  brand: z.string().min(1).max(100).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  excludeInCatalog: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// === Routes ===

/**
 * GET /api/catalogs
 * Query: status, search
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const q = listQuerySchema.parse(req.query);
    const catalogs = await catalogService.listCatalogs(req.user.tenantId, q);
    res.json({ data: catalogs });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalogs/:id
 * Full detail: items (with product), customers, field config
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const detail = await catalogService.getCatalog(req.user.tenantId, req.params.id);
    res.json({ data: detail });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/catalogs
 * Body: { name, description?, status? }
 * Otomatik olarak default field config (10 alan visible) eklenir
 */
router.post('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = createSchema.parse(req.body);
    const catalog = await catalogService.createCatalog(req.user.tenantId, req.user.id, input);
    res.status(201).json({ data: catalog });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/catalogs/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = updateSchema.parse(req.body);
    const catalog = await catalogService.updateCatalog(
      req.user.tenantId,
      req.params.id,
      input,
    );
    res.json({ data: catalog });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/catalogs/:id
 * CASCADE: items, customers, field config silinir
 */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await catalogService.deleteCatalog(req.user.tenantId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/catalogs/:id/customers
 * Body: { customerIds: [...] }
 * Response: { added, skipped }
 */
router.post('/:id/customers', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = assignCustomersSchema.parse(req.body);
    const result = await catalogService.assignCustomers(
      req.user.tenantId,
      req.params.id,
      input.customerIds,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/catalogs/:id/customers/:customerId
 */
router.delete('/:id/customers/:customerId', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await catalogService.removeCustomer(
      req.user.tenantId,
      req.params.id,
      req.params.customerId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/catalogs/:id/items
 * Body: { productId, customPrice?, customNotes?, sortOrder? }
 * Response: { data: CatalogItemDTO }
 */
router.post('/:id/items', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = addItemSchema.parse(req.body);
    const item = await catalogService.addItem(req.user.tenantId, req.params.id, input);
    res.status(201).json({ data: item });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/catalogs/:id/items/:itemId
 */
router.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await catalogService.removeItem(
      req.user.tenantId,
      req.params.id,
      req.params.itemId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/catalogs/:id/fields
 * Body: { fields: [{ fieldName, isVisible, sortOrder }] }
 * Replace all field config
 */
router.put('/:id/fields', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = fieldConfigSchema.parse(req.body);
    const fields = await catalogService.updateFieldConfig(
      req.user.tenantId,
      req.params.id,
      input.fields as Array<{ fieldName: 'sku' | 'name' | 'description' | 'price' | 'currency' | 'category' | 'brand' | 'unit' | 'notes' | 'images'; isVisible: boolean; sortOrder: number }>,
    );
    res.json({ data: fields });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalogs/:id/filter
 * "Hızlı bant" filtre — katalog için ürün seçim wizard'ında kullanılır
 * Query: search, categoryId, brand, priceMin, priceMax, excludeInCatalog, limit
 */
router.get('/:id/filter', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const q = filterQuerySchema.parse(req.query);
    const products = await catalogService.filterProductsForCatalog(
      req.user.tenantId,
      req.params.id,
      {
        search: q.search,
        categoryId: q.categoryId,
        brand: q.brand,
        priceMin: q.priceMin,
        priceMax: q.priceMax,
        excludeInCatalog: q.excludeInCatalog === 'true',
        limit: q.limit,
      },
    );
    res.json({ data: products });
  } catch (err) {
    next(err);
  }
});

export default router;
