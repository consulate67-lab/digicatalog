import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Customer source enum.
 *
 * - `manual`: UI'dan elle eklendi
 * - `excel`:  Toplu Excel import ile eklendi
 * - `erp`:    Faz 4'te ERP'den senkronize edildi
 *
 * `erpCustomerId` ile birlikte ERP'den gelen kayıtların güncellenmesi
 * (sync) veya duplicate oluşması önlenir (unique index tenantId +
 * erpCustomerId).
 */
export const customerSource = pgEnum('customer_source', ['manual', 'excel', 'erp']);

/**
 * Customers tablosu. Katalog oluştururken (Faz 5) bu listeden
 * çoklu müşteri seçilecek.
 *
 * Alanlar:
 * - name (zorunlu): firma adı
 * - contactName: ilgili kişi (satış temsilcisi vs.)
 * - email, phone, address: iletişim
 * - taxNumber, taxOffice: Türkiye için vergi bilgileri (fatura)
 * - erpCustomerId: ERP'den gelen ID (Faz 4 senkronizasyon için)
 * - source: nasıl eklendiği (manual/excel/erp)
 * - notes: serbest not (ziyaret sıklığı, özel istekler, vs.)
 * - isActive: katalogda gösterilsin mi (pasif = listeden gizli)
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    taxNumber: text('tax_number'),
    taxOffice: text('tax_office'),
    erpCustomerId: text('erp_customer_id'),
    source: customerSource('source').notNull().default('manual'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('customers_tenant_idx').on(t.tenantId),
    emailIdx: index('customers_email_idx').on(t.email),
    // ERP senkronizasyonu için: aynı ERP ID ile tekrar insert'i önler
    tenantErpCustomerIdx: index('customers_tenant_erp_idx').on(t.tenantId, t.erpCustomerId),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
