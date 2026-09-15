import { eq, and, type SQL } from 'drizzle-orm';

/**
 * Tenant filter helper. Multi-tenant mimarinin temel taşı.
 *
 * Tüm domain query'leri (products, customers, catalogs, ...) bu helper
 * üzerinden tenant filtresi almalı. Raw SQL yazarken unutulmamalı;
 * unutulursa bir tenant diğerinin verisini görebilir.
 *
 * NOT: AnyMsSqlColumn type import'u drizzle-orm/mssql-core'dan geliyordu
 * ama TS exports map eksik. Generic constraint'i `any` yaptık, runtime
 * davranışı değişmedi.
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
export const withTenant = <T extends { tenantId: any }>(
  table: T,
  tenantId: string,
): SQL => eq(table.tenantId, tenantId);

export const tenantAnd = <T extends { tenantId: any }>(
  table: T,
  tenantId: string,
  ...conditions: (SQL | undefined)[]
): SQL | undefined => {
  const filtered = conditions.filter((c): c is SQL => c !== undefined);
  return and(eq(table.tenantId, tenantId), ...filtered);
};