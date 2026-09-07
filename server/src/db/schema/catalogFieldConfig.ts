import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { catalogs } from './catalogs';

/**
 * catalog_field_config — katalogda hangi alanlar viewer'da görünsün.
 *
 * Kullanıcı gereksinimi 10: "Katalogda gösterilecek alanlar" — admin
 * catalog oluştururken/duzenlerken her alan icin visible toggle.
 *
 * field_name izinli degerler:
 *   'sku', 'name', 'description', 'price', 'currency', 'category',
 *   'brand', 'unit', 'notes', 'images'
 *
 * Katalog olusturuldugunda default: tum alanlar visible=true.
 * Sort order ile viewer'daki alan sirasi belirlenir.
 */
export const catalogFieldConfig = pgTable(
  'catalog_field_config',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    fieldName: text('field_name').notNull(),
    isVisible: boolean('is_visible').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    catalogIdx: index('catalog_field_config_catalog_idx').on(t.catalogId),
    catalogFieldUnique: unique('catalog_field_config_unique').on(t.catalogId, t.fieldName),
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
