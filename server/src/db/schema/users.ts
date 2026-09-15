import {
  mssqlTable,
  uniqueidentifier,
  nvarchar,
  varchar,
  bit,
  datetime2,
  sql,
  index,
  uniqueIndex,
} from 'drizzle-orm/mssql-core';
import { tenants } from './tenants';

/**
 * User role â€” MSSQL'de enum yok. varchar(20) + app-level validation
 * (zod schema) ile kontrol edilir. Drizzle MSSQL enum oluÅŸturmuyor.
 */
export type UserRole = 'admin' | 'member';

export const users = mssqlTable(
  'users',
  {
    id: uniqueidentifier('id').default(sql`newid()`).primaryKey(),
    tenantId: uniqueidentifier('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: nvarchar('password_hash', { length: 255 }).notNull(),
    name: nvarchar('name', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('member'),
    isActive: bit('is_active', { mode: 'boolean' }).notNull().default(true),
    lastLoginAt: datetime2('last_login_at'),
    createdAt: datetime2('created_at').default(sql`getdate()`).notNull(),
    updatedAt: datetime2('updated_at').default(sql`getdate()`).notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
    tenantIdx: index('users_tenant_idx').on(t.tenantId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;