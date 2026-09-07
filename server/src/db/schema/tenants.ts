import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Tenants — multi-tenant SaaS'in kök tablosu.
 *
 * Her kiracı (müşteri firma) bir tenant'tır. Tüm domain tabloları
 * (users, products, customers, catalogs, ...) tenant_id FK ile buraya
 * bağlanır. Row-level isolation bu sayede sağlanır.
 *
 * - `slug`: URL'de kullanılacak kısa ad (örn. "acme-catalog")
 *   Register'da unique kontrolü yapılır, değiştirilemez (şimdilik).
 * - `erpProvider`: Faz 4'te aktif olacak. Boş = ERP entegrasyonu yok.
 * - `erpConfig`: ERP provider'ın ihtiyaç duyduğu config (URL, API key, vs.)
 *   Production'da encrypt edilmeli (KMS veya app-level encryption).
 * - `createdAt/updatedAt`: Audit trail.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    erpProvider: text('erp_provider'), // null = no ERP integration
    erpConfig: jsonb('erp_config'), // { url, apiKey, ... } (Faz 4'te)
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: index('tenants_slug_idx').on(t.slug),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
