import sql from 'mssql';
import crypto from 'crypto';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import * as emailService from './email.service';

/**
 * Catalog Shares service (Faz 9.4.1).
 *
 * Token-based public sharing (no email gerekli — MVP).
 * Admin katalog icin share olusturur, customer'a URL gonderir.
 * URL: /viewer/share/:token
 *
 * Multi-tenant: share tenant_id catalog uzerinden inherit edilir
 * (catalog.tenant_id ile ayni). Admin sadece kendi tenant'inin
 * kataloglarini paylasabilir.
 *
 * Expiry: expires_at ile. access_count + last_accessed_at her
 * public erisimde guncellenir (analytics).
 */

export interface CatalogShareDTO {
  id: string;
  catalogId: string;
  customerEmail: string;
  accessToken: string;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
}

export interface CreateShareInput {
  customerEmail: string;
  expiresInDays: number; // 1..365
}

export interface PublicSharedCatalogDTO {
  shareId: string;
  catalogId: string;
  catalogName: string;
  customerEmail: string;
  expiresAt: string;
  catalog: {
    id: string;
    name: string;
    description: string | null;
    items: Array<{
      id: string;
      product: {
        sku: string;
        name: string;
        price: number;
        currency: string;
        primaryImage: { base64Data: string; mimeType: string } | null;
      };
    }>;
  };
}

// === Token generator ===

/**
 * URL-safe 64-character hex token. crypto.randomBytes(32) ile uretilir
 * (kriptografik olarak guvenli). URL'de paylasilan anahtar.
 */
export const generateAccessToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// === Create ===

export const createShare = async (
  tenantId: string,
  catalogId: string,
  userId: string,
  input: CreateShareInput,
): Promise<CatalogShareDTO> => {
  const pool = await getPool();

  // Katalog var mi ve tenant'a mi ait?
  // Ayni zamanda catalog adini cek (email template icin lazim).
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id, name FROM catalogs WHERE id = @catalogId AND tenant_id = @tenantId`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Katalog bulunamadi');
  const catalogName: string = ex.recordset[0].name;

  // Token benzersiz olsun (cok nadir collision, ama kontrol edelim)
  let token = generateAccessToken();
  let attempts = 0;
  while (attempts < 3) {
    const dup = await pool.request()
      .input('token', sql.VarChar, token)
      .query(`SELECT id FROM catalog_shares WHERE access_token = @token`);
    if (!dup.recordset[0]) break;
    token = generateAccessToken();
    attempts++;
  }
  if (attempts >= 3) {
    throw new HttpError(500, 'Token uretilemedi (collision), tekrar deneyin');
  }

  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  const r = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .input('customerEmail', sql.NVarChar, input.customerEmail)
    .input('accessToken', sql.VarChar, token)
    .input('expiresAt', sql.DateTime2, expiresAt)
    .input('createdBy', sql.UniqueIdentifier, userId)
    .query(`INSERT INTO catalog_shares
            (catalog_id, customer_email, access_token, expires_at, created_by)
            OUTPUT INSERTED.id, INSERTED.created_at
            VALUES (@catalogId, @customerEmail, @accessToken, @expiresAt, @createdBy)`);
  const id = r.recordset[0].id;
  const createdAt = r.recordset[0].created_at;

  logger.info(
    { shareId: id, catalogId, customerEmail: input.customerEmail, expiresAt, expiresInDays: input.expiresInDays },
    'Catalog share olusturuldu',
  );

  // === Best-effort: share link email'i musteriye gonder ===
  // Hata olursa share basarisiz OLMAZ, sadece log'lanir. Admin
  // share URL'i zaten API response'da goruyor, email sadece bonus.
  const shareUrl = `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/viewer/share/${token}`;
  emailService
    .sendShareLink({
      to: input.customerEmail,
      catalogName,
      shareUrl,
      expiresAt,
    })
    .then((result) => {
      logger.info(
        { shareId: id, mode: result.mode, delivered: result.delivered, messageId: result.messageId },
        'Share link email sonucu',
      );
    })
    .catch((err) => {
      logger.error(
        { shareId: id, err: err?.message ?? String(err), customerEmail: input.customerEmail },
        'Share link email gonderilemedi (best-effort, share gecerli)',
      );
    });

  return {
    id,
    catalogId,
    customerEmail: input.customerEmail,
    accessToken: token,
    expiresAt: expiresAt.toISOString(),
    createdBy: userId,
    createdAt: createdAt.toISOString(),
    lastAccessedAt: null,
    accessCount: 0,
  };
};

// === List (admin) ===

export const listSharesForCatalog = async (
  tenantId: string,
  catalogId: string,
): Promise<CatalogShareDTO[]> => {
  const pool = await getPool();

  // Tenant filtresi (katalog uzerinden)
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id FROM catalogs WHERE id = @catalogId AND tenant_id = @tenantId`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Katalog bulunamadi');

  const r = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id, catalog_id AS catalogId, customer_email AS customerEmail,
            access_token AS accessToken, expires_at AS expiresAt,
            created_by AS createdBy, created_at AS createdAt,
            last_accessed_at AS lastAccessedAt, access_count AS accessCount
            FROM catalog_shares
            WHERE catalog_id = @catalogId
            ORDER BY created_at DESC`);

  return r.recordset.map((row) => ({
    id: row.id,
    catalogId: row.catalogId,
    customerEmail: row.customerEmail,
    accessToken: row.accessToken,
    expiresAt: row.expiresAt.toISOString(),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lastAccessedAt: row.lastAccessedAt ? row.lastAccessedAt.toISOString() : null,
    accessCount: row.accessCount,
  }));
};

// === Revoke (admin) ===

export const revokeShare = async (
  tenantId: string,
  catalogId: string,
  shareId: string,
): Promise<void> => {
  const pool = await getPool();

  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .input('shareId', sql.UniqueIdentifier, shareId)
    .query(`DELETE cs
            FROM catalog_shares cs
            JOIN catalogs c ON c.id = cs.catalog_id
            WHERE cs.id = @shareId
              AND cs.catalog_id = @catalogId
              AND c.tenant_id = @tenantId`);
  if (r.rowsAffected[0] === 0) throw new HttpError(404, 'Share bulunamadi');
  logger.info({ shareId, catalogId, tenantId }, 'Catalog share revoke edildi');
};

// === Get by token (public — no auth) ===

export const getSharedCatalogByToken = async (
  token: string,
): Promise<PublicSharedCatalogDTO> => {
  const pool = await getPool();

  // 1) Share var mi?
  const shareR = await pool.request()
    .input('token', sql.VarChar, token)
    .query(`SELECT id, catalog_id AS catalogId, customer_email AS customerEmail,
            expires_at AS expiresAt, access_count AS accessCount
            FROM catalog_shares
            WHERE access_token = @token`);
  const share = shareR.recordset[0];
  if (!share) throw new HttpError(404, 'Share bulunamadi veya iptal edilmis');

  // 2) Expire kontrolu
  if (new Date(share.expiresAt).getTime() < Date.now()) {
    throw new HttpError(410, 'Share suresi dolmus');
  }

  // 3) Katalog + items cek (musteriye minimal veri)
  const catR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, share.catalogId)
    .query(`SELECT id, name, description FROM catalogs WHERE id = @catalogId`);
  const catalog = catR.recordset[0];
  if (!catalog) throw new HttpError(404, 'Katalog bulunamadi');

  // Items — sadece public-facing alanlar (sku, name, price, currency, image)
  // Aciklama, brand, category, notes dahil edilmez (musteri sadece
  // temel bilgileri gorur).
  const itemsR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, share.catalogId)
    .query(`SELECT ci.id, ci.sort_order AS sortOrder,
            p.sku, p.name AS pName,
            CAST(p.price AS VARCHAR) AS pPrice, p.currency AS pCurrency,
            (SELECT TOP 1 base64_data FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageData,
            (SELECT TOP 1 mime_type FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageMime
            FROM catalog_items ci
            JOIN products p ON p.id = ci.product_id
            WHERE ci.catalog_id = @catalogId
            ORDER BY ci.sort_order`);

  const items = itemsR.recordset.map((r) => ({
    id: r.id,
    product: {
      sku: r.sku,
      name: r.pName,
      price: Number(r.pPrice),
      currency: r.pCurrency,
      primaryImage: r.primaryImageData
        ? { base64Data: r.primaryImageData, mimeType: r.primaryImageMime! }
        : null,
    },
  }));

  // 4) Access tracking (async fire-and-forget — response'u bloklamaz)
  setImmediate(() => {
    pool.request()
      .input('shareId', sql.UniqueIdentifier, share.id)
      .query(`UPDATE catalog_shares
              SET last_accessed_at = getdate(), access_count = access_count + 1
              WHERE id = @shareId`)
      .catch((err) => {
        logger.warn({ err: (err as Error).message, shareId: share.id }, 'Access tracking update failed');
      });
  });

  return {
    shareId: share.id,
    catalogId: share.catalogId,
    catalogName: catalog.name,
    customerEmail: share.customerEmail,
    expiresAt: share.expiresAt.toISOString(),
    catalog: {
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
      items,
    },
  };
};
