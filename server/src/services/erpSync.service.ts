import { eq, and } from 'drizzle-orm';
import { db } from '../config/database';
import { tenants, products, customers, categories, type NewProduct, type NewCustomer } from '../db/schema';
import { withTenant } from '../db/helpers';
import { getAdapter, type ErpProduct, type ErpCustomer } from '../integrations/erp';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * ERP senkronizasyon servisi.
 *
 * Akış:
 * 1) Tenant'ın erpProvider + erpConfig'ini DB'den al
 * 2) registry'den adapter oluştur
 * 3) adapter.fetchProducts() / fetchCustomers() çağır
 * 4) Her item için DijiCatalog DB'de upsert yap
 *    - erpProductId/erpCustomerId ile mevcut kayıt ara
 *    - Varsa güncelle, yoksa oluştur (source='erp')
 *    - Kategori otomatik oluştur
 * 5) Adapter'ı kapat, özet dön
 *
 * Güvenlik: erpConfig hassas (DB şifresi içerebilir) — sadece admin
 * erişebilmeli. Endpoint'lerde requireRole('admin') zorunlu.
 */

export interface SyncResult {
  fetched: number;
  added: number;
  updated: number;
  errors: Array<{ erpId: string; message: string }>;
}

const getTenantErpConfig = async (
  tenantId: string,
): Promise<{ provider: string | null; config: Record<string, unknown> }> => {
  const [t] = await db
    .select({ erpProvider: tenants.erpProvider, erpConfig: tenants.erpConfig })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t) throw new HttpError(404, 'Tenant bulunamadı');
  return {
    provider: t.erpProvider,
    config: (t.erpConfig as Record<string, unknown>) ?? {},
  };
};

// === Category upsert helper ===

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);

const categoryCache = new Map<string, string>(); // tenant:catName → id

const findOrCreateCategory = async (
  tenantId: string,
  name: string | undefined,
): Promise<string | null> => {
  if (!name) return null;
  const cacheKey = `${tenantId}:${name}`;
  if (categoryCache.has(cacheKey)) return categoryCache.get(cacheKey)!;

  // Mevcut kategori var mı?
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.tenantId, tenantId), eq(categories.name, name)))
    .limit(1);
  if (existing) {
    categoryCache.set(cacheKey, existing.id);
    return existing.id;
  }

  // Yoksa oluştur (slug benzersizliği için retry)
  const baseSlug = slugify(name) || `cat-${Date.now()}`;
  let slug = baseSlug;
  let attempt = 0;
  while (attempt < 10) {
    try {
      const [created] = await db
        .insert(categories)
        .values({ tenantId, name, slug })
        .returning({ id: categories.id });
      categoryCache.set(cacheKey, created.id);
      return created.id;
    } catch {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }
  }
  return null;
};

// === Products sync ===

export const syncProducts = async (tenantId: string): Promise<SyncResult> => {
  const { provider, config } = await getTenantErpConfig(tenantId);
  if (!provider) {
    throw new HttpError(400, 'ERP provider tanımlı değil. Önce ayarlardan provider seçin.');
  }

  const adapter = getAdapter(provider, config);
  const result: SyncResult = { fetched: 0, added: 0, updated: 0, errors: [] };

  try {
    const erpProducts: ErpProduct[] = await adapter.fetchProducts();
    result.fetched = erpProducts.length;
    logger.info({ tenantId, provider, fetched: result.fetched }, 'ERP products fetched');

    for (const p of erpProducts) {
      try {
        if (!p.erpId || !p.name) {
          result.errors.push({ erpId: p.erpId ?? '?', message: 'erpId ve name zorunludur' });
          continue;
        }

        const categoryId = await findOrCreateCategory(tenantId, p.categoryName);
        const sku = p.sku || p.erpId;

        // Mevcut ürün var mı? (tenant + erpProductId eşleşmesi yok —
        // schema'da yok, eklenebilir; burada SKU'ya göre ara)
        const [existing] = await db
          .select({ id: products.id })
          .from(products)
          .where(and(withTenant(products, tenantId), eq(products.sku, sku)))
          .limit(1);

        if (existing) {
          // Update
          await db
            .update(products)
            .set({
              name: p.name,
              description: p.description ?? null,
              price: String(p.price),
              currency: (['TRY', 'USD', 'EUR', 'GBP'].includes(p.currency ?? '') ? p.currency : 'TRY') as 'TRY' | 'USD' | 'EUR' | 'GBP',
              categoryId,
              brand: p.brand ?? null,
              unit: p.unit ?? null,
              updatedAt: new Date(),
            })
            .where(eq(products.id, existing.id));
          result.updated++;
        } else {
          // Insert
          const insertData: NewProduct = {
            tenantId,
            sku,
            name: p.name,
            description: p.description ?? null,
            price: String(p.price),
            currency: (p.currency && ['TRY', 'USD', 'EUR', 'GBP'].includes(p.currency) ? p.currency : 'TRY') as 'TRY' | 'USD' | 'EUR' | 'GBP',
            categoryId,
            brand: p.brand ?? null,
            unit: p.unit ?? null,
            attributes: {},
            isActive: true,
          };
          await db.insert(products).values(insertData);
          result.added++;
        }
      } catch (err) {
        result.errors.push({ erpId: p.erpId, message: (err as Error).message });
      }
    }
  } finally {
    await adapter.close().catch(() => undefined);
  }

  logger.info({ tenantId, ...result }, 'ERP products sync completed');
  return result;
};

// === Customers sync ===

export const syncCustomers = async (tenantId: string): Promise<SyncResult> => {
  const { provider, config } = await getTenantErpConfig(tenantId);
  if (!provider) {
    throw new HttpError(400, 'ERP provider tanımlı değil. Önce ayarlardan provider seçin.');
  }

  const adapter = getAdapter(provider, config);
  const result: SyncResult = { fetched: 0, added: 0, updated: 0, errors: [] };

  try {
    const erpCustomers: ErpCustomer[] = await adapter.fetchCustomers();
    result.fetched = erpCustomers.length;
    logger.info({ tenantId, provider, fetched: result.fetched }, 'ERP customers fetched');

    for (const c of erpCustomers) {
      try {
        if (!c.erpId || !c.name) {
          result.errors.push({ erpId: c.erpId ?? '?', message: 'erpId ve name zorunludur' });
          continue;
        }

        // Mevcut müşteri var mı? (tenant + erpCustomerId)
        const [existing] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(withTenant(customers, tenantId), eq(customers.erpCustomerId, c.erpId)))
          .limit(1);

        if (existing) {
          await db
            .update(customers)
            .set({
              name: c.name,
              contactName: c.contactName ?? null,
              email: c.email ?? null,
              phone: c.phone ?? null,
              address: c.address ?? null,
              taxNumber: c.taxNumber ?? null,
              taxOffice: c.taxOffice ?? null,
              updatedAt: new Date(),
            })
            .where(eq(customers.id, existing.id));
          result.updated++;
        } else {
          const insertData: NewCustomer = {
            tenantId,
            name: c.name,
            contactName: c.contactName ?? null,
            email: c.email ?? null,
            phone: c.phone ?? null,
            address: c.address ?? null,
            taxNumber: c.taxNumber ?? null,
            taxOffice: c.taxOffice ?? null,
            erpCustomerId: c.erpId,
            source: 'erp',
            isActive: true,
          };
          await db.insert(customers).values(insertData);
          result.added++;
        }
      } catch (err) {
        result.errors.push({ erpId: c.erpId, message: (err as Error).message });
      }
    }
  } finally {
    await adapter.close().catch(() => undefined);
  }

  logger.info({ tenantId, ...result }, 'ERP customers sync completed');
  return result;
};

// === Config management ===

export interface TenantErpConfigResponse {
  provider: string | null;
  config: Record<string, unknown> | null;
  providerMeta: {
    label: string;
    description: string;
  } | null;
}

export const getTenantErpConfigResponse = async (
  tenantId: string,
): Promise<TenantErpConfigResponse> => {
  const { provider, config } = await getTenantErpConfig(tenantId);
  if (!provider) return { provider: null, config: null, providerMeta: null };

  // Şifre alanlarını redakte et
  const redactedConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof key === 'string' && /password|secret|token|api[_-]?key/i.test(key)) {
      redactedConfig[key] = value ? '••••••••' : '';
    } else {
      redactedConfig[key] = value;
    }
  }

  const { listProviders } = await import('../integrations/erp');
  const providers = listProviders();
  const meta = providers.find((p) => p.name === provider);
  return {
    provider,
    config: redactedConfig,
    providerMeta: meta
      ? { label: meta.label, description: meta.description }
      : { label: provider, description: 'Bilinmeyen provider' },
  };
};

export const setTenantErpConfig = async (
  tenantId: string,
  provider: string,
  config: Record<string, unknown>,
): Promise<void> => {
  // Provider adı geçerli mi?
  const { listProviders } = await import('../integrations/erp');
  const validNames = listProviders().map((p) => p.name);
  if (!validNames.includes(provider as never)) {
    throw new HttpError(400, `Geçersiz provider: ${provider}. Geçerli: ${validNames.join(', ')}`);
  }

  await db
    .update(tenants)
    .set({ erpProvider: provider, erpConfig: config, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
};

export const testConnection = async (
  tenantId: string,
): Promise<{ ok: boolean; latencyMs: number; message?: string; details?: Record<string, unknown> }> => {
  const { provider, config } = await getTenantErpConfig(tenantId);
  if (!provider) {
    return { ok: false, latencyMs: 0, message: 'Provider tanımlı değil' };
  }
  const adapter = getAdapter(provider, config);
  try {
    return await adapter.ping();
  } finally {
    await adapter.close().catch(() => undefined);
  }
};
