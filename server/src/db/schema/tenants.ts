import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  datetime2,
  sql as sqlTag,
  index,
} from 'drizzle-orm/mssql-core';

/**
 * Tenants — multi-tenant SaaS'in kök tablosu.
 *
 * Her kiracı (müşteri firma) bir tenant'tır. Tüm domain tabloları
 * (users, products, customers, catalogs, ...) tenant_id FK ile buraya
 * bağlanır. Row-level isolation bu sayede sağlanır.
 *
 * MSSQL notları:
 * - `id` uniqueidentifier (default `newid()`) — PG'deki `uuid` karşılığı
 * - `name` nvarchar(255) — Unicode metin
 * - `slug` varchar(100) — URL-safe ASCII
 * - `erpConfig` nvarchar(max) — JSON string olarak saklanır (MSSQL'de
 *   json tipi de var ama nvarchar(max) daha geniş uyumluluk)
 * - `createdAt/updatedAt` datetime2 — timezone-aware değil; UTC'de tutarız
 */
export const tenants = mssqlTable(
  'tenants',
  {
    id: uniqueidentifier('id').default(sqlTag`newid()`).primaryKey(),
    name: nvarchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    erpProvider: varchar('erp_provider', { length: 50 }),
    erpConfig: nvarchar('erp_config', { length: 'max' }),
    createdAt: datetime2('created_at').default(sqlTag`getdate()`).notNull(),
    updatedAt: datetime2('updated_at').default(sqlTag`getdate()`).notNull(),
  },
  (t) => ({
    slugIdx: index('tenants_slug_idx').on(t.slug),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;