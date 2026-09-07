import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { catalogs } from './catalogs';
import { products } from './products';

/**
 * catalog_items — katalogdaki ürünler.
 *
 * Her urun bir katalogda sadece bir kez olabilir (unique constraint).
 * ON DELETE CASCADE: katalog silinince urunleri de gider, urun
 * silinince katalogdaki kaydi da gider.
 *
 * Opsiyonel override'lar:
 * - customPrice: NULL ise urun.price kullanilir, dolu ise override
 * - customNotes: NULL ise urun.notes kullanilir
 * Boylece ayni urun farkli kataloglarda farkli fiyatla gosterilebilir
 * (indirim, ozel teklif vs.)
 */
export const catalogItems = pgTable(
  'catalog_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    customPrice: numeric('custom_price', { precision: 12, scale: 2 }),
    customNotes: text('custom_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    catalogIdx: index('catalog_items_catalog_idx').on(t.catalogId),
    productIdx: index('catalog_items_product_idx').on(t.productId),
    catalogProductUnique: unique('catalog_items_catalog_product_unique').on(t.catalogId, t.productId),
  }),
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;
