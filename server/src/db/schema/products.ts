import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  integer,
  boolean,
  jsonb,
  index,
  unique,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { categories } from './categories';

/**
 * Currency enum. TRY default (Türkiye pazarı odaklı).
 * İleride ekleme: 'JPY', 'CHF', 'AUD' vs.
 */
export const currency = pgEnum('currency', ['TRY', 'USD', 'EUR', 'GBP']);

/**
 * Products — domain'in ana tablosu.
 *
 * - `sku`: Stok kodu, tenant_id + sku composite unique
 *   Aynı SKU iki firmada bağımsız kullanılabilir
 * - `price`: numeric(12, 2) — 10^10 TRY'ye kadar, 2 ondalık
 *   Drizzle numeric'i string olarak döner, parseFloat gerekebilir
 * - `currency`: enum
 * - `attributes`: JSONB — esnek özel alanlar (renk, beden, malzeme, vs.)
 *   Schema-free, tenant kendi alanlarını ekleyebilir
 * - `isActive`: false ise kataloglarda gizli
 * - `categoryId`: set null on delete (kategori silinse ürün kalsın)
 *
 * Full-text search (Faz 5'te): name + description'a GIN tsvector
 * index eklenebilir, şimdilik LIKE/ILIKE yeterli.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    price: numeric('price', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: currency('currency').notNull().default('TRY'),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    brand: text('brand'),
    unit: text('unit'), // "adet", "kg", "metre", "litre", ...
    notes: text('notes'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('products_tenant_idx').on(t.tenantId),
    categoryIdx: index('products_category_idx').on(t.categoryId),
    tenantSkuUnique: unique('products_tenant_sku_unique').on(t.tenantId, t.sku),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
