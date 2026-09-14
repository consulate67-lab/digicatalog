import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  int,
  bit,
  datetime2,
  sql as sqlTag,
  index,
} from 'drizzle-orm/mssql-core';
import { tenants } from './tenants';
import { products } from './products';

/**
 * Product images — base64 DB depolama.
 *
 * `base64Data` tam data URL veya sadece base64 string.
 * data URL önerilir: "data:image/jpeg;base64,/9j/4AAQ..."
 * frontend <img src={base64Data}> ile direkt gösterebilir.
 *
 * Tip: nvarchar(max) — base64 string için yeterli (10MB image ≈ 13.3MB base64,
 * ama pratikte sıkıştırma sonrası 200-500KB = 270-670KB string).
 */
export const productImages = mssqlTable(
  'product_images',
  {
    id: uniqueidentifier('id').default(sqlTag`newid()`).primaryKey(),
    tenantId: uniqueidentifier('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uniqueidentifier('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    base64Data: nvarchar('base64_data', { length: 'max' }).notNull(),
    mimeType: varchar('mime_type', { length: 50 }).notNull(),
    fileSize: int('file_size').notNull(),
    sortOrder: int('sort_order').notNull().default(0),
    isPrimary: bit('is_primary', { mode: 'boolean' }).notNull().default(false),
    createdAt: datetime2('created_at').default(sqlTag`getdate()`).notNull(),
  },
  (t) => ({
    productIdx: index('product_images_product_idx').on(t.productId),
    tenantIdx: index('product_images_tenant_idx').on(t.tenantId),
  }),
);

export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;