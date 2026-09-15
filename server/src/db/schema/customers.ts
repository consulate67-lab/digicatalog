import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  bit,
  datetime2,
  sql,
  index,
} from 'drizzle-orm/mssql-core';
import { tenants } from './tenants';

/**
 * Customer source â€” MSSQL'de enum yok, varchar(20) + app-level validation.
 * - `manual`: UI'dan elle eklendi
 * - `excel`:  Toplu Excel import ile eklendi
 * - `erp`:    Faz 4'te ERP'den senkronize edildi
 */
export type CustomerSource = 'manual' | 'excel' | 'erp';

export const customers = mssqlTable(
  'customers',
  {
    id: uniqueidentifier('id').default(sql`newid()`).primaryKey(),
    tenantId: uniqueidentifier('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: nvarchar('name', { length: 255 }).notNull(),
    contactName: nvarchar('contact_name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    address: nvarchar('address', { length: 500 }),
    taxNumber: varchar('tax_number', { length: 50 }),
    taxOffice: nvarchar('tax_office', { length: 255 }),
    erpCustomerId: varchar('erp_customer_id', { length: 100 }),
    source: varchar('source', { length: 20 }).notNull().default('manual'),
    notes: nvarchar('notes', { length: 'max' }),
    isActive: bit('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: datetime2('created_at').default(sql`getdate()`).notNull(),
    updatedAt: datetime2('updated_at').default(sql`getdate()`).notNull(),
  },
  (t) => ({
    tenantIdx: index('customers_tenant_idx').on(t.tenantId),
    emailIdx: index('customers_email_idx').on(t.email),
    // ERP senkronizasyonu iÃ§in: aynÄ± ERP ID ile tekrar insert'i Ã¶nler
    tenantErpCustomerIdx: index('customers_tenant_erp_idx').on(
      t.tenantId,
      t.erpCustomerId,
    ),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;