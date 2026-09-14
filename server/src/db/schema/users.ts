import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  bit,
  datetime2,
  sql as sqlTag,
  index,
  uniqueIndex,
} from 'drizzle-orm/mssql-core';
import { tenants } from './tenants';

/**
 * User role — MSSQL'de enum yok. varchar(20) + app-level validation
 * (zod schema) ile kontrol edilir. Drizzle MSSQL enum oluşturmuyor.
 */
export type UserRole = 'admin' | 'member';

export const users = mssqlTable(
  'users',
  {
    id: uniqueidentifier('id').default(sqlTag`newid()`).primaryKey(),
    tenantId: uniqueidentifier('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: nvarchar('password_hash', { length: 255 }).notNull(),
    name: nvarchar('name', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('member'),
    isActive: bit('is_active', { mode: 'boolean' }).notNull().default(true),
    lastLoginAt: datetime2('last_login_at'),
    createdAt: datetime2('created_at').default(sqlTag`getdate()`).notNull(),
    updatedAt: datetime2('updated_at').default(sqlTag`getdate()`).notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
    tenantIdx: index('users_tenant_idx').on(t.tenantId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;