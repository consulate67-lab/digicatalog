import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import * as productService from '../services/product.service';
import { HttpError } from '../middleware/errorHandler';

const router = Router();

// Tüm product endpoint'leri auth gerektirir
router.use(authMiddleware);

// === Validation ===

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().min(1).max(100).optional(),
  categoryId: z.string().uuid().optional(),
  brand: z.string().min(1).max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['name', 'price', 'createdAt', 'sortOrder']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const productInputSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.enum(['TRY', 'USD', 'EUR', 'GBP']).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  brand: z.string().max(100).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  attributes: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const productUpdateSchema = productInputSchema.partial();

const imageInputSchema = z.object({
  base64Data: z.string().min(100).max(15_000_000),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  fileSize: z.number().int().positive().max(15_000_000),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// === Routes ===

/**
 * GET /api/products
 *
 * Query: page, limit, search, categoryId, brand, isActive, sortBy, sortOrder
 * Response: { data: ProductDTO[], pagination: {...} }
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const query = listQuerySchema.parse(req.query);
    const result = await productService.listProducts(req.user.tenantId, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      categoryId: query.categoryId,
      brand: query.brand,
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:id
 * Response: { data: ProductDetailDTO }
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const product = await productService.getProduct(req.user.tenantId, req.params.id);
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products
 * Body: ProductInput
 * Response 201: { data: ProductDetailDTO }
 */
router.post('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = productInputSchema.parse(req.body);
    const product = await productService.createProduct(req.user.tenantId, input);
    res.status(201).json({ data: product });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/products/:id
 * Body: Partial<ProductInput>
 */
router.put('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = productUpdateSchema.parse(req.body);
    const product = await productService.updateProduct(
      req.user.tenantId,
      req.params.id,
      input,
    );
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/products/:id
 * Response 204
 */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await productService.deleteProduct(req.user.tenantId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// === Image routes ===

/**
 * POST /api/products/:id/images
 * Body: { base64Data, mimeType, fileSize, isPrimary?, sortOrder? }
 * Response 201: { data: ProductImage }
 */
router.post('/:id/images', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = imageInputSchema.parse(req.body);
    const image = await productService.addProductImage(
      req.user.tenantId,
      req.params.id,
      input,
    );
    res.status(201).json({ data: image });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/products/:id/images/:imageId
 * Response 204
 */
router.delete('/:id/images/:imageId', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await productService.deleteProductImage(
      req.user.tenantId,
      req.params.id,
      req.params.imageId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/products/:id/images/:imageId/primary
 * Bu resmi primary yapar (diğerlerinin primary'sini kaldırır)
 */
router.patch('/:id/images/:imageId/primary', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await productService.setImagePrimary(
      req.user.tenantId,
      req.params.id,
      req.params.imageId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
