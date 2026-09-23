import { Router } from 'express';
import * as catalogSharesService from '../services/catalogShares.service';

/**
 * Public catalog share viewer (Faz 9.4.3).
 *
 * Mount: app.use('/api/viewer', publicShareRouter)
 * NO auth middleware (public). Mevcut viewer.ts /api/viewer/:id
 * ile ayni mount path, ayri router dosyasi (separation of concerns).
 *
 * Token ile erisim: musteri share URL'ine tiklar, bu endpoint
 * catalog verisini minimal haliyle (sku/name/price/image) doner.
 * Expire kontrolu service icinde (410 Gone).
 *
 * ONEMLI: Bu router pdfRouter'dan ONCE mount edilmeli (auth-free).
 * Mount sirasi app.ts'te garantilendi.
 */

const router = Router();

/**
 * GET /api/viewer/share/:token
 * No auth. Returns PublicSharedCatalogDTO.
 *
 * Responses:
 *   200 — share valid + catalog data
 *   404 — token not found / revoked
 *   410 — share expired
 */
router.get('/share/:token', async (req, res, next) => {
  try {
    const token = req.params.token;
    if (!token || token.length !== 64) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Gecersiz share token',
      });
    }
    const data = await catalogSharesService.getSharedCatalogByToken(token);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
