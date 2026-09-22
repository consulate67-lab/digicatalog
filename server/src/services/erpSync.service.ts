import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { PROVIDERS, getAdapter, type ProviderName } from '../integrations/erp/registry';
import { fetchProductImage } from './imageSync';

/**
 * ERP Sync service (raw mssql + KorgunMssqlAdapter).
 *
 * Faz 7 — Korgün ERP entegrasyonu:
 *   - getTenantErpConfigResponse / setTenantErpConfig: tenants.erp_provider + erp_config
 *     kolonlarinda tenant-scoped ERP ayarlari (JSON).
 *   - testConnection: KorgunMssqlAdapter.ping() — baglanti testi.
 *   - syncProducts: stokkart → products (sku unique key, upsert).
 *   - syncCustomers: Cari_Kart → customers (erp_customer_id unique key, upsert).
 *
 * ONEMLI: ERP sync tenant-scoped. Her tenant kendi ERP config'i ile kendi
 * urun/musteri setini gunceller. Row-level isolation DijiCatalog DB'de
 * tenant_id ile saglanir.
 */

export interface SyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ sku?: string; customerId?: string; message: string }>;
  /** ERP -> IIS -> DB'ye base64 olarak indirilen urun resmi sayıları. */
  imagesInserted?: number;
  imagesFailed?: number;
  imagesSkipped?: number;
}

interface TenantErpConfig {
  provider: ProviderName | null;
  config: Record<string, unknown>;
}

const PASSWORD_FIELD = 'password';

const redactConfig = (config: Record<string, unknown>): Record<string, unknown> => {
  if (!config || typeof config !== 'object') return {};
  const out: Record<string, unknown> = { ...config };
  if (PASSWORD_FIELD in out) {
    out[PASSWORD_FIELD] = '••••••';
  }
  return out;
};

/**
 * tenants tablosundan ERP provider + config (JSON) oku.
 * Provider yoksa mock default kullanilir.
 */
export const getTenantErpConfig = async (tenantId: string): Promise<TenantErpConfig> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT erp_provider AS provider, erp_config AS config
            FROM tenants WHERE id = @tenantId`);
  const row = r.recordset[0];
  if (!row) throw new HttpError(404, 'Tenant bulunamadi');

  let config: Record<string, unknown> = {};
  if (row.config) {
    try {
      const parsed = JSON.parse(row.config as string);
      if (parsed && typeof parsed === 'object') config = parsed;
    } catch {
      // Hatali JSON — bos config kabul et
      logger.warn({ tenantId }, 'tenants.erp_config JSON parse hatasi, bos config kullaniliyor');
    }
  }
  return {
    provider: (row.provider as ProviderName | null) ?? null,
    config,
  };
};

export interface TenantErpConfigResponse {
  provider: ProviderName | null;
  config: Record<string, unknown>;
  providerMeta: {
    name: ProviderName;
    label: string;
    description: string;
    configSchema: ReadonlyArray<{ key: string; label: string; type: string; required: boolean; placeholder?: string; default?: unknown }>;
  } | null;
}

export const getTenantErpConfigResponse = async (tenantId: string): Promise<TenantErpConfigResponse> => {
  const { provider, config } = await getTenantErpConfig(tenantId);
  const providerMeta = provider && provider in PROVIDERS
    ? {
        name: provider,
        label: PROVIDERS[provider].label,
        description: PROVIDERS[provider].description,
        configSchema: [...PROVIDERS[provider].configSchema],
      }
    : null;
  return {
    provider,
    config: redactConfig(config),
    providerMeta,
  };
};

export const setTenantErpConfig = async (
  tenantId: string,
  providerName: string,
  config: Record<string, unknown>,
): Promise<void> => {
  if (!(providerName in PROVIDERS)) {
    throw new HttpError(400, `Bilinmeyen ERP provider: ${providerName}`);
  }
  // Boş password gönderildiyse (UI redaction sonrasi) eski degeri koru
  let finalConfig = { ...config };
  if (finalConfig[PASSWORD_FIELD] === '••••••' || finalConfig[PASSWORD_FIELD] === '') {
    const existing = await getTenantErpConfig(tenantId);
    if (existing.config[PASSWORD_FIELD]) {
      finalConfig[PASSWORD_FIELD] = existing.config[PASSWORD_FIELD];
    } else {
      throw new HttpError(400, 'ERP sifresi zorunludur');
    }
  }

  const pool = await getPool();
  await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('provider', sql.NVarChar, providerName)
    .input('config', sql.NVarChar, JSON.stringify(finalConfig))
    .query(`UPDATE tenants
            SET erp_provider = @provider, erp_config = @config, updated_at = getdate()
            WHERE id = @tenantId`);
  logger.info({ tenantId, provider: providerName }, 'ERP config guncellendi');
};

export const testConnection = async (tenantId: string): Promise<{
  ok: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}> => {
  const { provider, config } = await getTenantErpConfig(tenantId);
  if (!provider) {
    return { ok: false, latencyMs: 0, message: 'ERP provider secilmemis' };
  }
  const adapter = getAdapter(provider, config);
  try {
    const result = await adapter.ping();
    return result;
  } finally {
    await adapter.close().catch(() => undefined);
  }
};

export const syncProducts = async (tenantId: string): Promise<SyncResult> => {
  const { provider, config } = await getTenantErpConfig(tenantId);
  const result: SyncResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  if (!provider) {
    throw new HttpError(400, 'ERP provider secilmemis. Once ayarlari kaydedin.');
  }

  const adapter = getAdapter(provider, config);
  let erpProducts;
  try {
    erpProducts = await adapter.fetchProducts();
  } catch (err) {
    await adapter.close().catch(() => undefined);
    const message = (err as Error).message;
    logger.error({ err, message, tenantId }, 'ERP urun cekme hatasi');
    throw new HttpError(502, `ERP urun cekme hatasi: ${message}`);
  }

  const djiPool = await getPool();

  // 1) Kategorileri once topla + upsert et (name unique per tenant)
  // name -> category_id map olustur
  const categoryNameToId = new Map<string, string>();
  const uniqueCategories = Array.from(new Set(
    erpProducts
      .map((p) => p.categoryName?.trim())
      .filter((n): n is string => !!n && n.length > 0)
  ));
  for (const name of uniqueCategories) {
    try {
      const ex = await djiPool.request()
        .input('tenantId', sql.UniqueIdentifier, tenantId)
        .input('name', sql.NVarChar, name)
        .query(`SELECT id FROM categories WHERE tenant_id = @tenantId AND name = @name`);
      if (ex.recordset[0]) {
        categoryNameToId.set(name, ex.recordset[0].id);
      } else {
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 50);
        const ins = await djiPool.request()
          .input('tenantId', sql.UniqueIdentifier, tenantId)
          .input('name', sql.NVarChar, name)
          .input('slug', sql.NVarChar, slug)
          .query(`INSERT INTO categories (tenant_id, name, slug, is_active)
                  OUTPUT INSERTED.id
                  VALUES (@tenantId, @name, @slug, 1)`);
        categoryNameToId.set(name, ins.recordset[0].id);
      }
    } catch (err) {
      result.errors.push({ message: `Kategori upsert hatasi (${name}): ${(err as Error).message}` });
    }
  }

  // 2) Urunleri upsert et (kategori baglantilariyla)
  for (const p of erpProducts) {
    if (!p.sku || !p.name) {
      result.skipped++;
      result.errors.push({ sku: p.sku, message: 'SKU veya isim bos' });
      continue;
    }
    const categoryId = p.categoryName ? categoryNameToId.get(p.categoryName.trim()) ?? null : null;
    try {
      // Ayni tenant icinde sku unique
      const ex = await djiPool.request()
        .input('tenantId', sql.UniqueIdentifier, tenantId)
        .input('sku', sql.NVarChar, p.sku)
        .query(`SELECT id FROM products WHERE tenant_id = @tenantId AND sku = @sku`);
      if (ex.recordset[0]) {
        await djiPool.request()
          .input('tenantId', sql.UniqueIdentifier, tenantId)
          .input('sku', sql.NVarChar, p.sku)
          .input('name', sql.NVarChar, p.name)
          .input('description', sql.NVarChar, p.description ?? null)
          .input('price', sql.Decimal(12, 2), String(p.price ?? 0))
          .input('currency', sql.NVarChar, p.currency ?? 'TRY')
          .input('brand', sql.NVarChar, p.brand ?? null)
          .input('unit', sql.NVarChar, p.unit ?? null)
          .input('categoryId', sql.UniqueIdentifier, categoryId)
          .query(`UPDATE products
                  SET name = @name,
                      description = COALESCE(@description, description),
                      price = @price,
                      currency = @currency,
                      brand = COALESCE(@brand, brand),
                      unit = COALESCE(@unit, unit),
                      category_id = COALESCE(@categoryId, category_id),
                      updated_at = getdate()
                  WHERE tenant_id = @tenantId AND sku = @sku`);
        result.updated++;
      } else {
        await djiPool.request()
          .input('tenantId', sql.UniqueIdentifier, tenantId)
          .input('sku', sql.NVarChar, p.sku)
          .input('name', sql.NVarChar, p.name)
          .input('description', sql.NVarChar, p.description ?? null)
          .input('price', sql.Decimal(12, 2), String(p.price ?? 0))
          .input('currency', sql.NVarChar, p.currency ?? 'TRY')
          .input('brand', sql.NVarChar, p.brand ?? null)
          .input('unit', sql.NVarChar, p.unit ?? null)
          .input('categoryId', sql.UniqueIdentifier, categoryId)
          .query(`INSERT INTO products (tenant_id, sku, name, description, price, currency, brand, unit, category_id, is_active)
                  VALUES (@tenantId, @sku, @name, @description, @price, @currency, @brand, @unit, @categoryId, 1)`);
        result.inserted++;
      }
    } catch (err) {
      result.errors.push({ sku: p.sku, message: (err as Error).message });
    }
  }

  await adapter.close().catch(() => undefined);

  // 3) Image sync pass — ERP Picture path'ten IIS'ten indir, base64 DB'ye yaz.
  // Ayri pass olarak: upsert logic'i bozmadan, sadece picture olan urunler icin.
  // REPLACE stratejisi: her sync'te product_id icin eski primary'ler silinir,
  // yenisi eklenir. (ERP'de resim degisti ise guncellenir.)
  const imageUrlPrefix = process.env.ERP_IMAGE_URL_PREFIX ?? 'http://192.168.2.67:1903/';
  let imagesInserted = 0;
  let imagesFailed = 0;
  let imagesSkipped = 0;
  for (const p of erpProducts) {
    if (!p.sku || !p.name) continue;
    if (!p.picture) { imagesSkipped++; continue; }

    const img = await fetchProductImage(p.picture, imageUrlPrefix);
    if (!img) { imagesFailed++; continue; }

    try {
      const pidR = await djiPool.request()
        .input('tenantId', sql.UniqueIdentifier, tenantId)
        .input('sku', sql.NVarChar, p.sku)
        .query(`SELECT id FROM products WHERE tenant_id = @tenantId AND sku = @sku`);
      const productId = pidR.recordset[0]?.id;
      if (!productId) { imagesFailed++; continue; }

      // REPLACE: eski resimleri sil, yeni primary ekle
      await djiPool.request()
        .input('tenantId', sql.UniqueIdentifier, tenantId)
        .input('productId', sql.UniqueIdentifier, productId)
        .query(`DELETE FROM product_images WHERE tenant_id = @tenantId AND product_id = @productId`);
      await djiPool.request()
        .input('tenantId', sql.UniqueIdentifier, tenantId)
        .input('productId', sql.UniqueIdentifier, productId)
        .input('base64Data', sql.NVarChar, img.base64Data)
        .input('mimeType', sql.NVarChar, img.mimeType)
        .input('fileSize', sql.Int, img.fileSize)
        .query(`INSERT INTO product_images (tenant_id, product_id, base64_data, mime_type, file_size, is_primary, sort_order)
                VALUES (@tenantId, @productId, @base64Data, @mimeType, @fileSize, 1, 0)`);
      imagesInserted++;
    } catch (err) {
      imagesFailed++;
      logger.warn({ sku: p.sku, err: (err as Error).message }, 'Image DB insert failed');
    }
  }
  result.imagesInserted = imagesInserted;
  result.imagesFailed = imagesFailed;
  result.imagesSkipped = imagesSkipped;

  logger.info(
    { tenantId, provider, inserted: result.inserted, updated: result.updated, skipped: result.skipped, errors: result.errors.length, categories: categoryNameToId.size, imagesInserted, imagesFailed, imagesSkipped },
    'ERP urun senkronizasyonu tamamlandi',
  );
  return result;
};

export const syncCustomers = async (tenantId: string): Promise<SyncResult> => {
  const { provider, config } = await getTenantErpConfig(tenantId);
  const result: SyncResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  if (!provider) {
    throw new HttpError(400, 'ERP provider secilmemis. Once ayarlari kaydedin.');
  }

  const adapter = getAdapter(provider, config);
  let erpCustomers;
  try {
    erpCustomers = await adapter.fetchCustomers();
  } catch (err) {
    await adapter.close().catch(() => undefined);
    const message = (err as Error).message;
    logger.error({ err, message, tenantId }, 'ERP musteri cekme hatasi');
    throw new HttpError(502, `ERP musteri cekme hatasi: ${message}`);
  }

  const djiPool = await getPool();
  for (const c of erpCustomers) {
    if (!c.erpId || !c.name) {
      result.skipped++;
      result.errors.push({ customerId: c.erpId, message: 'ERP ID veya isim bos' });
      continue;
    }
    try {
      // erp_customer_id tenant-scoped unique
      const ex = await djiPool.request()
        .input('tenantId', sql.UniqueIdentifier, tenantId)
        .input('erpId', sql.NVarChar, c.erpId)
        .query(`SELECT id FROM customers WHERE tenant_id = @tenantId AND erp_customer_id = @erpId`);
      if (ex.recordset[0]) {
        await djiPool.request()
          .input('tenantId', sql.UniqueIdentifier, tenantId)
          .input('erpId', sql.NVarChar, c.erpId)
          .input('name', sql.NVarChar, c.name)
          .input('contactName', sql.NVarChar, c.contactName ?? null)
          .input('email', sql.NVarChar, c.email ?? null)
          .input('phone', sql.NVarChar, c.phone ?? null)
          .input('address', sql.NVarChar, c.address ?? null)
          .input('taxNumber', sql.NVarChar, c.taxNumber ?? null)
          .input('taxOffice', sql.NVarChar, c.taxOffice ?? null)
          .query(`UPDATE customers
                  SET name = @name,
                      contact_name = COALESCE(@contactName, contact_name),
                      email = COALESCE(@email, email),
                      phone = COALESCE(@phone, phone),
                      address = COALESCE(@address, address),
                      tax_number = COALESCE(@taxNumber, tax_number),
                      tax_office = COALESCE(@taxOffice, tax_office),
                      source = 'erp',
                      updated_at = getdate()
                  WHERE tenant_id = @tenantId AND erp_customer_id = @erpId`);
        result.updated++;
      } else {
        await djiPool.request()
          .input('tenantId', sql.UniqueIdentifier, tenantId)
          .input('erpId', sql.NVarChar, c.erpId)
          .input('name', sql.NVarChar, c.name)
          .input('contactName', sql.NVarChar, c.contactName ?? null)
          .input('email', sql.NVarChar, c.email ?? null)
          .input('phone', sql.NVarChar, c.phone ?? null)
          .input('address', sql.NVarChar, c.address ?? null)
          .input('taxNumber', sql.NVarChar, c.taxNumber ?? null)
          .input('taxOffice', sql.NVarChar, c.taxOffice ?? null)
          .query(`INSERT INTO customers (tenant_id, erp_customer_id, name, contact_name, email, phone, address, tax_number, tax_office, source, is_active)
                  VALUES (@tenantId, @erpId, @name, @contactName, @email, @phone, @address, @taxNumber, @taxOffice, 'erp', 1)`);
        result.inserted++;
      }
    } catch (err) {
      result.errors.push({ customerId: c.erpId, message: (err as Error).message });
    }
  }

  await adapter.close().catch(() => undefined);
  logger.info(
    { tenantId, provider, inserted: result.inserted, updated: result.updated, skipped: result.skipped, errors: result.errors.length },
    'ERP musteri senkronizasyonu tamamlandi',
  );
  return result;
};

logger.info('erpSync.service.ts (raw mssql) yuklendi');
