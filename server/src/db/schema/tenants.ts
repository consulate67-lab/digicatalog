import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  datetime2,
  sql,
  index,
} from 'drizzle-orm/mssql-core';

/**
 * Tenants â€” multi-tenant SaaS'in kÃ¶k tablosu.
 *
 * Her kiracÄ± (mÃ¼ÅŸteri firma) bir tenant'tÄ±r. TÃ¼m domain tablolarÄ±
 * (users, products, customers, catalogs, ...) tenant_id FK ile buraya
 * baÄŸlanÄ±r. Row-level isolation bu sayede saÄŸlanÄ±r.
 *
 * MSSQL notlarÄ±:
 * - `id` uniqueidentifier (default `newid()`) â€” PG'deki `uuid` karÅŸÄ±lÄ±ÄŸÄ±
 * - `name` nvarchar(255) â€” Unicode metin
 * - `slug` varchar(100) â€” URL-safe ASCII
 * - `erpConfig` nvarchar(max) â€” JSON string olarak saklanÄ±r (MSSQL'de
 *   json tipi de var ama nvarchar(max) daha geniÅŸ uyumluluk)
 * - `createdAt/updatedAt` datetime2 â€” timezone-aware deÄŸil; UTC'de tutarÄ±z
 */
export const tenants = mssqlTable(
  'tenants',
  {
    id: uniqueidentifier('id').default(sql`newid()`).primaryKey(),
    name: nvarchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    erpProvider: varchar('erp_provider', { length: 50 }),
    erpConfig: nvarchar('erp_config', { length: 'max' }),
    createdAt: datetime2('created_at').default(sql`getdate()`).notNull(),
    updatedAt: datetime2('updated_at').default(sql`getdate()`).notNull(),
  },
  (t) => ({
    slugIdx: index('tenants_slug_idx').on(t.slug),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;