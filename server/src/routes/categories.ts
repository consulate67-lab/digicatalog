import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import * as categoryService from '../services/category.service';
import { HttpError } from '../middleware/errorHandler';

const router = Router();

// Tüm category endpoint'leri auth gerektirir
router.use(authMiddleware);

// === Validation ===

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  tree: z.enum(['true', 'false']).optional(),
  parentId: z.string().uuid().nullable().optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});

// === Routes ===

/**
 * GET /api/categories
 *
 * Query: ?tree=true|false, ?parentId=xxx|root, ?includeInactive=true
 * Response: Category[] (sortOrder + name asc)
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const query = listQuerySchema.parse(req.query);
    const categories = await categoryService.listCategories(req.user.tenantId, {
      tree: query.tree === 'true',
      parentId: query.parentId === 'root' ? null : query.parentId,
      includeInactive: query.includeInactive === 'true',
    });
    res.json({ data: categories });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/categories/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const category = await categoryService.getCategory(req.user.tenantId, req.params.id);
    res.json({ data: category });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/categories
 * Body: { name, slug, parentId?, sortOrder?, isActive? }
 */
router.post('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = createSchema.parse(req.body);
    const category = await categoryService.createCategory(req.user.tenantId, input);
    res.status(201).json({ data: category });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/categories/:id
 * Body: partial
 */
router.put('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = updateSchema.parse(req.body);
    const category = await categoryService.updateCategory(
      req.user.tenantId,
      req.params.id,
      input,
    );
    res.json({ data: category });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/categories/:id
 * Child kategoriler cascade ile silinir, ürünlerin categoryId'si set null olur
 */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await categoryService.deleteCategory(req.user.tenantId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
