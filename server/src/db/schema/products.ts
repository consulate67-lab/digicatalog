import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  decimal,
  int,
  bit,
  datetime2,
  sql,
  index,
  uniqueIndex,
} from 'drizzle-orm/mssql-core';
import { tenants } from './tenants';
import { categories } from './categories';

/**
 * Currency â€” MSSQL'de enum yok, varchar(3) + app-level validation.
 * TRY default (TÃ¼rkiye pazarÄ± odaklÄ±).
 */
export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';

export const products = mssqlTable(
  'products',
  {
    id: uniqueidentifier('id').default(sql`newid()`).primaryKey(),
    tenantId: uniqueidentifier('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 100 }).notNull(),
    name: nvarchar('name', { length: 500 }).notNull(),
    description: nvarchar('description', { length: 'max' }),
    price: decimal('price', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: varchar('currency', { length: 3 }).notNull().default('TRY'),
    categoryId: uniqueidentifier('category_id').references(
      () => categories.id,
      { onDelete: 'set null' },
    ),
    brand: nvarchar('brand', { length: 255 }),
    unit: varchar('unit', { length: 50 }),
    notes: nvarchar('notes', { length: 'max' }),
    /** MSSQL'de jsonb yok. JSON string olarak saklanÄ±r (Drizzle parse etmez). */
    attributes: nvarchar('attributes', { length: 'max' })
      .$type<Record<string, unknown>>()
      .default('{}'),
    sortOrder: int('sort_order').notNull().default(0),
    isActive: bit('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: datetime2('created_at').default(sql`getdate()`).notNull(),
    updatedAt: datetime2('updated_at').default(sql`getdate()`).notNull(),
  },
  (t) => ({
    tenantIdx: index('products_tenant_idx').on(t.tenantId),
    categoryIdx: index('products_category_idx').on(t.categoryId),
    tenantSkuUnique: uniqueIndex('products_tenant_sku_unique').on(
      t.tenantId,
      t.sku,
    ),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;