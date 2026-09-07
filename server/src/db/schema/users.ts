import { pgTable, text, timestamp, uuid, boolean, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * User role enum.
 *
 * - `admin`: Tenant üzerinde tam yetki (kullanıcı yönetimi, ayarlar,
 *   tüm CRUD). İlk kayıtta register olan kişi admin olur.
 * - `member`: Ürün/müşteri/katalog CRUD yapabilir, tenant ayarlarına
 *   ve kullanıcı yönetimine dokunamaz.
 *
 * İleride `viewer` (read-only) eklenebilir — şimdilik 2 seviye yeterli.
 */
export const userRole = pgEnum('user_role', ['admin', 'member']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: userRole('role').notNull().default('member'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: index('users_email_idx').on(t.email),
    tenantIdx: index('users_tenant_idx').on(t.tenantId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
