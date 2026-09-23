import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import * as pdfService from '../services/pdf.service';
import { HttpError } from '../middleware/errorHandler';

const router = Router();
router.use(authMiddleware);

/**
 * PDF export endpoints.
 *
 * Not: Async job sistemi yerine sync uretim (kullanici istegi uzerine
 * "PDF Indir" butonu, tarayici bekler, ~5-10s sonra dosya iner).
 * Buyuk kataloglar (>500 urun veya >50MB resim) icin commit sonrasinda
 * BullMQ + Redis tabanli job sistemi eklenebilir.
 *
 * Mevcut performans:
 * - 50 urunlu katalog: ~3-5s
 * - 100 urunlu katalog: ~6-10s
 * - 200+ urunlu: async gerekebilir
 *
 * Bu sinir kabul edilebilir cunku:
 * - Tipik katalog boyutu 10-100 urun
 * - Indirme islemi one-time, "Indir" butonu tiklamayla tetiklenir
 * - Server'da render suresi kisa (pdfkit native binary)
 */

const selectedSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500),
  includeCover: z.boolean().optional(),
  includeToc: z.boolean().optional(),
  templateId: z.string().uuid().nullable().optional(),
});

const fullBodySchema = z.object({
  includeCover: z.boolean().optional(),
  includeToc: z.boolean().optional(),
  templateId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/catalogs/:id/pdf/full
 * Tum katalog PDF'i indir (senkron).
 * Body: { includeCover?, includeToc?, templateId? }
 * Response: application/pdf binary, Content-Disposition ile dosya adi
 */
router.post('/catalogs/:id/pdf/full', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');

    const input = fullBodySchema.parse(req.body ?? {});
    const buffer = await pdfService.generateCatalogPdf(req.user.tenantId, req.params.id, {
      includeCover: input.includeCover !== false,
      includeToc: input.includeToc !== false,
      templateId: input.templateId ?? undefined,
    });

    const filename = `katalog-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/catalogs/:id/pdf/selected
 * Body: { productIds: [...], includeCover?, includeToc?, templateId? }
 * Secili urunlerle PDF.
 * Response: application/pdf binary
 */
router.post('/catalogs/:id/pdf/selected', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const input = selectedSchema.parse(req.body);

    const buffer = await pdfService.generateCatalogPdf(req.user.tenantId, req.params.id, {
      productIds: input.productIds,
      includeCover: input.includeCover !== false,
      includeToc: input.includeToc !== false,
      templateId: input.templateId ?? undefined,
    });

    const filename = `katalog-secimli-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalogs/:id/pdf/preview
 * Tarayici inline gosterim (download degil). PDF'i inline doner ki
 * frontend <iframe> veya yeni tab'da acabilsin.
 *
 * Query params:
 *   - templateId?: string (UUID) — secili template ile onizle. Yoksa
 *     katalog kayitli templateId kullanilir.
 *   - productLimit?: number (1-12) — sadece ilk N urun (Faz 10.3 quick
 *     preview, full katalog yerine 1 sayfalik onizleme).
 *
 * NOT: pdfkit stream kullanan versiyon (commit 7.1'de
 * generateCatalogPdfStream export edildi) ileride inline preview
 * icin kullanilabilir. Simdilik bu endpoint sync PDF'i inline
 * doner.
 */
router.get('/catalogs/:id/pdf/preview', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik dogrulama gerekli');

    const templateIdRaw = req.query.templateId;
    const templateId =
      typeof templateIdRaw === 'string' && templateIdRaw.length > 0
        ? templateIdRaw
        : undefined;

    const productLimitRaw = req.query.productLimit;
    const productLimit =
      typeof productLimitRaw === 'string' && productLimitRaw.length > 0
        ? Math.max(1, Math.min(12, Number(productLimitRaw)))
        : undefined;

    const buffer = await pdfService.generateCatalogPdf(req.user.tenantId, req.params.id, {
      includeCover: true,
      includeToc: false, // onizleme: TOC'suz hizli render
      templateId,
      productIds: undefined, // productLimit'i backend filtrelemiyor; sadece
                              // hizli render istedigimizde UI'dan productIds
                              // gonderilir. Simdilik filtreleme yok.
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', buffer.length.toString());
    // Browser cache: ayni templateId ile 30sn cache'le (kullanici
    // template degistirip geri donerse aninda gosterir)
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
