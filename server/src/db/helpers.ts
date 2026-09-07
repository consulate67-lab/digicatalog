import { eq, and, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Tenant filter helper. Multi-tenant mimarinin temel taşı.
 *
 * Tüm domain query'leri (products, customers, catalogs, ...) bu helper
 * üzerinden tenant filtresi almalı. Raw SQL yazarken unutulmamalı;
 * unutulursa bir tenant diğerinin verisini görebilir.
 *
 * Kullanım:
 *   const products = await db
 *     .select()
 *     .from(products)
 *     .where(withTenant(products, req.user!.tenantId));
 *
 * Zincirleme koşullarla:
 *   const filtered = await db
 *     .select()
 *     .from(products)
 *     .where(tenantAnd(products, tenantId, eq(products.isActive, true)));
 */
export const withTenant = <T extends { tenantId: AnyPgColumn }>(
  table: T,
  tenantId: string,
): SQL => eq(table.tenantId, tenantId);

export const tenantAnd = <T extends { tenantId: AnyPgColumn }>(
  table: T,
  tenantId: string,
  ...conditions: (SQL | undefined)[]
): SQL | undefined => {
  const filtered = conditions.filter((c): c is SQL => c !== undefined);
  return and(eq(table.tenantId, tenantId), ...filtered);
};
