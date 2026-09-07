import {
  pgTable,
  timestamp,
  uuid,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { catalogs } from './catalogs';
import { customers } from './customers';

/**
 * catalog_customers — katalog çoklu müşteri ataması.
 *
 * Kullanıcı gereksinimi: "Yeni katalog oluştur dediğimizde müşteri
 * seçimi olacak birden fazla müşteri seçebiliriz" (gereksinim 12).
 *
 * Many-to-many: bir katalog birden çok müşteriye, bir müşteri birden
 * çok katalogda olabilir.
 *
 * NOT: Bu tablo "kime gönderildi" bilgisini tutmaz, sadece "kime
 * atanabilir" bilgisini. İleride "catalog_sends" (gönderim tarihi,
 * viewer token, vs.) eklenebilir.
 */
export const catalogCustomers = pgTable(
  'catalog_customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    catalogIdx: index('catalog_customers_catalog_idx').on(t.catalogId),
    customerIdx: index('catalog_customers_customer_idx').on(t.customerId),
    catalogCustomerUnique: unique('catalog_customers_unique').on(t.catalogId, t.customerId),
  }),
);

export type CatalogCustomer = typeof catalogCustomers.$inferSelect;
export type NewCatalogCustomer = typeof catalogCustomers.$inferInsert;
