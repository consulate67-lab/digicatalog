import { Router } from 'express';
import * as viewerService from '../services/viewer.service';

const router = Router();

/**
 * Public viewer endpoint. Auth GEREKTIRMEZ.
 *
 * GET /api/viewer/:catalogId
 *
 * Musteri ziyaretinde katalog linki acildiginda bu endpoint cagirilir.
 * Sadece 'active' statuslu kataloglara erisim saglar (taslak/arşiv 404).
 *
 * Tenant izolasyonu catalog uzerinden saglanir (her katalog tek bir
 * tenant'a ait, catalogId bilinmeli).
 *
 * Response: ViewerResponse
 *   - catalog: { id, name, description }
 *   - fieldConfig: 10 alan icin { visible, label, sortOrder }
 *   - categories: agac (parentId + productCount)
 *   - products: sirali, fieldConfig'e gore render edilir
 *   - customerCount: kac musterinin katalogda atali oldugu
 *   - createdAt
 */
router.get('/:catalogId', async (req, res, next) => {
  try {
    const data = await viewerService.getCatalogForViewer(req.params.catalogId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
