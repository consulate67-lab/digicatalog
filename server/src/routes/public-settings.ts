import { Router } from 'express';
import sql from 'mssql';
import { getPool } from '../config/database';

/**
 * Public catalog PDF settings endpoint (Faz 9.9).
 *
 * Mount: app.use('/api/public/catalogs/:catalogId/pdf-settings', ...)
 * NO auth — viewer.tsx (public viewer) icin.
 *
 * Returns: { templateId, showLogo, showPhone, ..., customCoverTitle, ... }
 * Customer-visible toggles + initial template id. Tenant-ozel
 * alanlar (qrLinkUrl, customFooterText) HARIC — musteri sadece
 * template secimi + iletisim bilgisi gorur.
 */

const router = Router({ mergeParams: true });

router.get('/pdf-settings', async (req, res, next) => {
  try {
    const pool = await getPool();

    // Katalog var mi + active mi?
    const catR = await pool.request()
      .input('catalogId', sql.UniqueIdentifier, req.params.catalogId)
      .query(`SELECT id, status FROM catalogs WHERE id = @catalogId`);
    if (!catR.recordset[0]) {
      return res.status(404).json({ error: 'NotFound', message: 'Katalog bulunamadi' });
    }
    if (catR.recordset[0].status !== 'active') {
      return res.status(404).json({ error: 'NotFound', message: 'Katalog aktif degil' });
    }

    // PDF settings (catalog_id ile). Yoksa fallback template id ile default.
    const sR = await pool.request()
      .input('catalogId', sql.UniqueIdentifier, req.params.catalogId)
      .query(`SELECT template_id AS templateId,
              show_logo AS showLogo, show_phone AS showPhone,
              show_email AS showEmail, show_address AS showAddress,
              show_instagram AS showInstagram, show_facebook AS showFacebook,
              show_website AS showWebsite, show_qr_code AS showQrCode,
              custom_cover_title AS customCoverTitle,
              updated_at AS updatedAt
              FROM catalog_pdf_settings WHERE catalog_id = @catalogId`);

    let settings: Record<string, unknown>;
    if (sR.recordset[0]) {
      const s = sR.recordset[0];
      settings = {
        templateId: s.templateId,
        showLogo: Boolean(s.showLogo),
        showPhone: Boolean(s.showPhone),
        showEmail: Boolean(s.showEmail),
        showAddress: Boolean(s.showAddress),
        showInstagram: Boolean(s.showInstagram),
        showFacebook: Boolean(s.showFacebook),
        showWebsite: Boolean(s.showWebsite),
        showQrCode: Boolean(s.showQrCode),
        customCoverTitle: s.customCoverTitle,
        updatedAt: (s.updatedAt as Date).toISOString(),
      };
    } else {
      // Default: ilk sistem presetini (catalog-standard) sec.
      const fbR = await pool.request()
        .input('slug', sql.VarChar, 'catalog-standard')
        .query(`SELECT id FROM pdf_templates WHERE slug = @slug AND tenant_id IS NULL`);
      settings = {
        templateId: fbR.recordset[0]?.id ?? null,
        showLogo: true, showPhone: true, showEmail: true, showAddress: true,
        showInstagram: false, showFacebook: false, showWebsite: true, showQrCode: false,
        customCoverTitle: null,
        updatedAt: new Date().toISOString(),
      };
    }

    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
});

export default router;
