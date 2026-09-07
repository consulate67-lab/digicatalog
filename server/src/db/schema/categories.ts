import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  index,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Categories — tenant-scoped, self-referencing tree.
 *
 * Hiyerarşik kategori yapısı (örn. Elektronik > Bilgisayar > Laptop).
 * `parentId` null ise root kategori. Drizzle'da self-ref için
 * AnyPgColumn type assertion gerekiyor.
 *
 * - `slug`: kategori URL'si (örn. "elektronik-bilgisayar")
 *   tenant_id + slug composite unique
 * - `sortOrder`: aynı parent altında sıralama (küçük = önde)
 * - `isActive`: false ise listelerde gizli, mevcut ürünler etkilenmez
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('categories_tenant_idx').on(t.tenantId),
    parentIdx: index('categories_parent_idx').on(t.parentId),
    tenantSlugUnique: unique('categories_tenant_slug_unique').on(t.tenantId, t.slug),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
