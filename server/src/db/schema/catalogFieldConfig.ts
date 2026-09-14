import {
  mssqlTable,
  uniqueidentifier,
  varchar,
  int,
  bit,
  index,
  uniqueIndex,
} from 'drizzle-orm/mssql-core';
import { catalogs } from './catalogs';

/**
 * catalog_field_config — katalogda hangi alanlar viewer'da görünsün.
 *
 * field_name izinli degerler:
 *   'sku', 'name', 'description', 'price', 'currency', 'category',
 *   'brand', 'unit', 'notes', 'images'
 */
export const catalogFieldConfig = mssqlTable(
  'catalog_field_config',
  {
    id: uniqueidentifier('id').default(sqlTag`newid()`).primaryKey(),
    catalogId: uniqueidentifier('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    fieldName: varchar('field_name', { length: 50 }).notNull(),
    isVisible: bit('is_visible', { mode: 'boolean' }).notNull().default(true),
    sortOrder: int('sort_order').notNull().default(0),
  },
  (t) => ({
    catalogIdx: index('catalog_field_config_catalog_idx').on(t.catalogId),
    catalogFieldUnique: uniqueIndex('catalog_field_config_unique').on(
      t.catalogId,
      t.fieldName,
    ),
  }),
);

export type CatalogFieldConfig = typeof catalogFieldConfig.$inferSelect;
export type NewCatalogFieldConfig = typeof catalogFieldConfig.$inferInsert;

/**
 * İzin verilen field name'ler (validation + UI'da gösterim için)
 */
export const CATALOG_FIELD_NAMES = [
  'sku',
  'name',
  'description',
  'price',
  'currency',
  'category',
  'brand',
  'unit',
  'notes',
  'images',
] as const;

export type CatalogFieldName = (typeof CATALOG_FIELD_NAMES)[number];

export const CATALOG_FIELD_LABELS: Record<CatalogFieldName, string> = {
  sku: 'SKU',
  name: 'Ürün Adı',
  description: 'Açıklama',
  price: 'Fiyat',
  currency: 'Para Birimi',
  category: 'Kategori',
  brand: 'Marka',
  unit: 'Birim',
  notes: 'Notlar',
  images: 'Görseller',
};