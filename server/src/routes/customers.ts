import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import * as customerService from '../services/customer.service';
import { HttpError } from '../middleware/errorHandler';

const router = Router();
router.use(authMiddleware);

// === Validation ===

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().min(1).max(100).optional(),
  source: z.enum(['manual', 'excel', 'erp']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const customerInputSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  taxNumber: z.string().max(50).nullable().optional(),
  taxOffice: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const customerUpdateSchema = customerInputSchema.partial();

// === Routes ===

/**
 * GET /api/customers
 * Query: page, limit, search, source, isActive, sortBy, sortOrder
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const q = listQuerySchema.parse(req.query);
    const result = await customerService.listCustomers(req.user.tenantId, {
      page: q.page,
      limit: q.limit,
      search: q.search,
      source: q.source,
      isActive: q.isActive === undefined ? undefined : q.isActive === 'true',
      sortBy: q.sortBy,
      sortOrder: q.sortOrder,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/customers/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const customer = await customerService.getCustomer(req.user.tenantId, req.params.id);
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/customers
 */
router.post('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = customerInputSchema.parse(req.body);
    const customer = await customerService.createCustomer(req.user.tenantId, input);
    res.status(201).json({ data: customer });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/customers/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = customerUpdateSchema.parse(req.body);
    const customer = await customerService.updateCustomer(
      req.user.tenantId,
      req.params.id,
      input,
    );
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/customers/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await customerService.deleteCustomer(req.user.tenantId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
