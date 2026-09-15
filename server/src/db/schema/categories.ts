import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  int,
  bit,
  datetime2,
  sql,
  index,
  uniqueIndex,
} from 'drizzle-orm/mssql-core';
import { tenants } from './tenants';

/**
 * Categories â€” tenant-scoped, self-referencing tree.
 *
 * HiyerarÅŸik kategori yapÄ±sÄ± (Ã¶rn. Elektronik > Bilgisayar > Laptop).
 * `parentId` null ise root kategori. Drizzle MSSQL'de self-ref iÃ§in
 * AnyMsSqlColumn type assertion gerekiyor.
 */
export const categories = mssqlTable(
  'categories',
  {
    id: uniqueidentifier('id').default(sql`newid()`).primaryKey(),
    tenantId: uniqueidentifier('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    parentId: uniqueidentifier('parent_id').references(
      (): any => categories.id,
      { onDelete: 'cascade' },
    ),
    name: nvarchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    sortOrder: int('sort_order').notNull().default(0),
    isActive: bit('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: datetime2('created_at').default(sql`getdate()`).notNull(),
    updatedAt: datetime2('updated_at').default(sql`getdate()`).notNull(),
  },
  (t) => ({
    tenantIdx: index('categories_tenant_idx').on(t.tenantId),
    parentIdx: index('categories_parent_idx').on(t.parentId),
    tenantSlugUnique: uniqueIndex('categories_tenant_slug_unique').on(
      t.tenantId,
      t.slug,
    ),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;