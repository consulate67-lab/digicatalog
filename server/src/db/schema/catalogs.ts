import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  datetime2,
  sql,
  index,
} from 'drizzle-orm/mssql-core';
import { tenants } from './tenants';
import { users } from './users';

/**
 * Catalog status â€” MSSQL'de enum yok, varchar(20) + app-level validation.
 * - draft: hazirlaniyor, viewer'da gozukmez
 * - active: yayinda, viewer linki erisebilir
 * - archived: pasif, viewer'da gozukmez ama DB'de tutulur
 */
export type CatalogStatus = 'draft' | 'active' | 'archived';

export const catalogs = mssqlTable(
  'catalogs',
  {
    id: uniqueidentifier('id').default(sql`newid()`).primaryKey(),
    tenantId: uniqueidentifier('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: nvarchar('name', { length: 255 }).notNull(),
    description: nvarchar('description', { length: 'max' }),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    createdBy: uniqueidentifier('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: datetime2('created_at').default(sql`getdate()`).notNull(),
    updatedAt: datetime2('updated_at').default(sql`getdate()`).notNull(),
  },
  (t) => ({
    tenantIdx: index('catalogs_tenant_idx').on(t.tenantId),
    statusIdx: index('catalogs_status_idx').on(t.tenantId, t.status),
  }),
);

export type Catalog = typeof catalogs.$inferSelect;
export type NewCatalog = typeof catalogs.$inferInsert;