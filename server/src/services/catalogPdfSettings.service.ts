import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';

/**
 * Catalog PDF Settings (Faz 9.3.1 — Aşama 9.4 endpoint entegrasyonu).
 *
 * Her katalog icin secili template + field toggles (logo, telefon,
 * email, adres, sosyal medya, footer text, QR kod).
 *
 * 1:1 iliski catalog_id ile. Yoksa default settings doner (ilk PDF
 * uretiminde otomatik olusturulur).
 */

export interface CatalogPdfSettingsDTO {
  catalogId: string;
  templateId: string;
  showLogo: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showAddress: boolean;
  showInstagram: boolean;
  showFacebook: boolean;
  showWebsite: boolean;
  showQrCode: boolean;
  customCoverTitle: string | null;
  customFooterText: string | null;
  qrLinkUrl: string | null;
  updatedAt: string;
}

export interface CatalogPdfSettingsInput {
  templateId: string;
  showLogo?: boolean;
  showPhone?: boolean;
  showEmail?: boolean;
  showAddress?: boolean;
  showInstagram?: boolean;
  showFacebook?: boolean;
  showWebsite?: boolean;
  showQrCode?: boolean;
  customCoverTitle?: string | null;
  customFooterText?: string | null;
  qrLinkUrl?: string | null;
}

// === Defaults (show_* true, custom_* null) ===

export const DEFAULT_PDF_SETTINGS = {
  showLogo: true,
  showPhone: true,
  showEmail: true,
  showAddress: true,
  showInstagram: false,
  showFacebook: false,
  showWebsite: true,
  showQrCode: false,
  customCoverTitle: null as string | null,
  customFooterText: null as string | null,
  qrLinkUrl: null as string | null,
};

// === Get ===

/**
 * catalog_pdf_settings'i oku. Katalog yoksa null doner (404 UI tarafinda).
 * Ayarlar yoksa default + fallback template_id olarak ilk sistem
 * presetini ('catalog-standard') kullanir — UI'da kullanici degistirebilir.
 */
export const getCatalogPdfSettings = async (
  tenantId: string,
  catalogId: string,
): Promise<CatalogPdfSettingsDTO | null> => {
  const pool = await getPool();

  // Katalog var mi?
  const catR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id FROM catalogs WHERE id = @catalogId AND tenant_id = @tenantId`);
  if (!catR.recordset[0]) return null;

  const r = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT catalog_id AS catalogId, template_id AS templateId,
            show_logo AS showLogo, show_phone AS showPhone,
            show_email AS showEmail, show_address AS showAddress,
            show_instagram AS showInstagram, show_facebook AS showFacebook,
            show_website AS showWebsite, show_qr_code AS showQrCode,
            custom_cover_title AS customCoverTitle,
            custom_footer_text AS customFooterText,
            qr_link_url AS qrLinkUrl, updated_at AS updatedAt
     FROM catalog_pdf_settings WHERE catalog_id = @catalogId`);
  if (r.recordset[0]) {
    const x = r.recordset[0];
    return {
      catalogId: x.catalogId,
      templateId: x.templateId,
      showLogo: Boolean(x.showLogo),
      showPhone: Boolean(x.showPhone),
      showEmail: Boolean(x.showEmail),
      showAddress: Boolean(x.showAddress),
      showInstagram: Boolean(x.showInstagram),
      showFacebook: Boolean(x.showFacebook),
      showWebsite: Boolean(x.showWebsite),
      showQrCode: Boolean(x.showQrCode),
      customCoverTitle: x.customCoverTitle,
      customFooterText: x.customFooterText,
      qrLinkUrl: x.qrLinkUrl,
      updatedAt: x.updatedAt.toISOString(),
    };
  }

  // Ayarlar yoksa default settings ile fallback template id kullan.
  // Fallback template id'yi bulmadan once katalog var mi kontrol etti,
  // simdi fallback template'i cekelim.
  const fbR = await pool.request()
    .input('slug', sql.VarChar, 'catalog-standard')
    .query(`SELECT id FROM pdf_templates WHERE slug = @slug AND tenant_id IS NULL`);
  const fallbackTemplateId = fbR.recordset[0]?.id;
  if (!fallbackTemplateId) {
    throw new HttpError(500, 'Fallback template (catalog-standard) bulunamadi — seed calistirin');
  }

  // Bos settings don — UI kullaniciya "henuz ayar yok" der, sonra create edilir.
  return {
    catalogId,
    templateId: fallbackTemplateId,
    ...DEFAULT_PDF_SETTINGS,
    customCoverTitle: null,
    customFooterText: null,
    qrLinkUrl: null,
    updatedAt: new Date().toISOString(),
  };
};

// === Upsert ===

export const upsertCatalogPdfSettings = async (
  tenantId: string,
  catalogId: string,
  input: CatalogPdfSettingsInput,
): Promise<CatalogPdfSettingsDTO> => {
  const pool = await getPool();

  // Katalog var mi?
  const catR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id FROM catalogs WHERE id = @catalogId AND tenant_id = @tenantId`);
  if (!catR.recordset[0]) throw new HttpError(404, 'Katalog bulunamadi');

  // Template var mi ve tenant'a ait mi?
  const tplR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('templateId', sql.UniqueIdentifier, input.templateId)
    .query(`SELECT id FROM pdf_templates
            WHERE id = @templateId
              AND (tenant_id IS NULL OR tenant_id = @tenantId)`);
  if (!tplR.recordset[0]) throw new HttpError(400, 'Gecersiz templateId');

  // UPSERT: var olan satiri update, yoksa insert
  await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .input('templateId', sql.UniqueIdentifier, input.templateId)
    .input('showLogo', sql.Bit, input.showLogo ?? DEFAULT_PDF_SETTINGS.showLogo)
    .input('showPhone', sql.Bit, input.showPhone ?? DEFAULT_PDF_SETTINGS.showPhone)
    .input('showEmail', sql.Bit, input.showEmail ?? DEFAULT_PDF_SETTINGS.showEmail)
    .input('showAddress', sql.Bit, input.showAddress ?? DEFAULT_PDF_SETTINGS.showAddress)
    .input('showInstagram', sql.Bit, input.showInstagram ?? DEFAULT_PDF_SETTINGS.showInstagram)
    .input('showFacebook', sql.Bit, input.showFacebook ?? DEFAULT_PDF_SETTINGS.showFacebook)
    .input('showWebsite', sql.Bit, input.showWebsite ?? DEFAULT_PDF_SETTINGS.showWebsite)
    .input('showQrCode', sql.Bit, input.showQrCode ?? DEFAULT_PDF_SETTINGS.showQrCode)
    .input('customCoverTitle', sql.NVarChar, input.customCoverTitle ?? null)
    .input('customFooterText', sql.NVarChar, input.customFooterText ?? null)
    .input('qrLinkUrl', sql.NVarChar, input.qrLinkUrl ?? null)
    .query(`IF EXISTS (SELECT 1 FROM catalog_pdf_settings WHERE catalog_id = @catalogId)
            BEGIN
              UPDATE catalog_pdf_settings
              SET template_id = @templateId,
                  show_logo = @showLogo, show_phone = @showPhone,
                  show_email = @showEmail, show_address = @showAddress,
                  show_instagram = @showInstagram, show_facebook = @showFacebook,
                  show_website = @showWebsite, show_qr_code = @showQrCode,
                  custom_cover_title = @customCoverTitle,
                  custom_footer_text = @customFooterText,
                  qr_link_url = @qrLinkUrl,
                  updated_at = getdate()
              WHERE catalog_id = @catalogId
            END
            ELSE
            BEGIN
              INSERT INTO catalog_pdf_settings
                (catalog_id, template_id, show_logo, show_phone, show_email, show_address,
                 show_instagram, show_facebook, show_website, show_qr_code,
                 custom_cover_title, custom_footer_text, qr_link_url)
              VALUES
                (@catalogId, @templateId, @showLogo, @showPhone, @showEmail, @showAddress,
                 @showInstagram, @showFacebook, @showWebsite, @showQrCode,
                 @customCoverTitle, @customFooterText, @qrLinkUrl)
            END`);

  const fresh = await getCatalogPdfSettings(tenantId, catalogId);
  if (!fresh) throw new HttpError(500, 'Upsert sonrasi okuma basarisiz');
  return fresh;
};
