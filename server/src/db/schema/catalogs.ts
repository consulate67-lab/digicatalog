import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

/**
 * Catalog status enum.
 *
 * - draft: hazirlaniyor, viewer'da gozukmez
 * - active: yayinda, viewer linki erisebilir
 * - archived: pasif, viewer'da gozukmez ama DB'de tutulur
 */
export const catalogStatus = pgEnum('catalog_status', ['draft', 'active', 'archived']);

/**
 * Catalogs tablosu — kiracının olusturdugu urun katalogu.
 *
 * - createdBy: katalogu olusturan user (audit + filtreleme)
 * - status: draft/active/archived
 */
export const catalogs = pgTable(
  'catalogs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: catalogStatus('status').notNull().default('draft'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('catalogs_tenant_idx').on(t.tenantId),
    statusIdx: index('catalogs_status_idx').on(t.tenantId, t.status),
  }),
);

export type Catalog = typeof catalogs.$inferSelect;
export type NewCatalog = typeof catalogs.$inferInsert;
