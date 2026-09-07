import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { products } from './products';

/**
 * Product images — base64 DB depolama.
 *
 * Kullanıcı gereksinimi: "Veri tabanında indirilen veya yüklenen resim
 * bilgileri tutmamız gerekiyor burada base 64 olarak veri tabanında
 * tutabiliriz."
 *
 * - `base64Data`: Tam data URL veya sadece base64 string
 *   data URL önerilir: "data:image/jpeg;base64,/9j/4AAQ..."
 *   frontend <img src={base64Data}> ile direkt gösterebilir
 * - `mimeType`: image/jpeg, image/png, image/webp
 * - `fileSize`: byte (compression sonrası, monitoring için)
 * - `isPrimary`: vitrin görseli (ürün listesinde gösterilecek)
 * - `sortOrder`: galeri sırası
 *
 * Limit: upload anında zod validation ile 10MB max, sıkıştırma
 * sonrası tipik 200-500KB base64 = ~270-670KB string.
 *
 * Tradeoff: 100 ürün × 5 resim × 500KB = 250MB DB. Çok büyürse
 * adapter pattern ile S3/Cloudinary'ye geçiş (Faz 8).
 */
export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    base64Data: text('base64_data').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productIdx: index('product_images_product_idx').on(t.productId),
    tenantIdx: index('product_images_tenant_idx').on(t.tenantId),
  }),
);

export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
