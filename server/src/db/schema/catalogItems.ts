import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  int,
  decimal,
  datetime2,
  sql,
  index,
  uniqueIndex,
} from 'drizzle-orm/mssql-core';
import { catalogs } from './catalogs';
import { products } from './products';

/**
 * catalog_items â€” katalogdaki Ã¼rÃ¼nler.
 *
 * Her urun bir katalogda sadece bir kez olabilir (unique constraint).
 * ON DELETE CASCADE: katalog silinince urunleri de gider, urun
 * silinince katalogdaki kaydi da gider.
 *
 * Opsiyonel override'lar:
 * - customPrice: NULL ise urun.price kullanilir, dolu ise override
 * - customNotes: NULL ise urun.notes kullanilir
 */
export const catalogItems = mssqlTable(
  'catalog_items',
  {
    id: uniqueidentifier('id').default(sql`newid()`).primaryKey(),
    catalogId: uniqueidentifier('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    productId: uniqueidentifier('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sortOrder: int('sort_order').notNull().default(0),
    customPrice: decimal('custom_price', { precision: 12, scale: 2 }),
    customNotes: nvarchar('custom_notes', { length: 'max' }),
    createdAt: datetime2('created_at').default(sql`getdate()`).notNull(),
  },
  (t) => ({
    catalogIdx: index('catalog_items_catalog_idx').on(t.catalogId),
    productIdx: index('catalog_items_product_idx').on(t.productId),
    catalogProductUnique: uniqueIndex(
      'catalog_items_catalog_product_unique',
    ).on(t.catalogId, t.productId),
  }),
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;