import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import * as catalogSharesService from '../services/catalogShares.service';
import { HttpError } from '../middleware/errorHandler';

/**
 * Catalog Shares admin endpoints (Faz 9.4.2).
 *
 * Mount: app.use('/api/catalogs/:catalogId/shares', sharesRouter)
 * mergeParams:true ile parent'tan gelen :catalogId erisilebilir.
 *
 * Not: Public viewer (GET /api/viewer/share/:token) ayri bir
 * route (Faz 9.4.3) — viewer.ts veya yeni public-share.ts.
 */

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// === Validation ===

const createSchema = z.object({
  customerEmail: z.string().email().max(255),
  expiresInDays: z.number().int().min(1).max(365),
});

// === Routes ===

/**
 * POST /api/catalogs/:catalogId/shares
 * Body: { customerEmail, expiresInDays (1-365) }
 * Returns: { data: CatalogShareDTO } (accessToken dahil)
 */
router.post('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = createSchema.parse(req.body);
    const share = await catalogSharesService.createShare(
      req.user.tenantId,
      req.params.catalogId,
      req.user.id,
      input,
    );
    res.status(201).json({ data: share });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalogs/:catalogId/shares
 * List active + expired shares for catalog (admin tarafi).
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const shares = await catalogSharesService.listSharesForCatalog(
      req.user.tenantId,
      req.params.catalogId,
    );
    res.json({ data: shares });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/catalogs/:catalogId/shares/:shareId
 * Revoke (kalici sil). Token ile erisim 404 olur sonra.
 */
router.delete('/:shareId', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    await catalogSharesService.revokeShare(
      req.user.tenantId,
      req.params.catalogId,
      req.params.shareId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
