import {
  mssqlTable,
  uniqueidentifier,
  datetime2,
  sql as sqlTag,
  index,
  uniqueIndex,
} from 'drizzle-orm/mssql-core';
import { catalogs } from './catalogs';
import { customers } from './customers';

/**
 * catalog_customers — katalog çoklu müşteri ataması.
 *
 * Many-to-many: bir katalog birden çok müşteriye, bir müşteri birden
 * çok katalogda olabilir.
 */
export const catalogCustomers = mssqlTable(
  'catalog_customers',
  {
    id: uniqueidentifier('id').default(sqlTag`newid()`).primaryKey(),
    catalogId: uniqueidentifier('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    customerId: uniqueidentifier('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    createdAt: datetime2('created_at').default(sqlTag`getdate()`).notNull(),
  },
  (t) => ({
    catalogIdx: index('catalog_customers_catalog_idx').on(t.catalogId),
    customerIdx: index('catalog_customers_customer_idx').on(t.customerId),
    catalogCustomerUnique: uniqueIndex('catalog_customers_unique').on(
      t.catalogId,
      t.customerId,
    ),
  }),
);

export type CatalogCustomer = typeof catalogCustomers.$inferSelect;
export type NewCatalogCustomer = typeof catalogCustomers.$inferInsert;