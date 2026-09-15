import sql from 'mssql';
import { getPool } from '../config/database';

/**
 * MSSQL tenant filter helper. Multi-tenant mimarinin temel taşı.
 *
 * Tüm domain query'leri (products, customers, catalogs, ...) bu helper
 * üzerinden tenant filtresi almalı. Raw SQL yazarken unutulmamalı;
 * unutulursa bir tenant diğerinin verisini görebilir.
 *
 * NOT: Drizzle ORM'den raw mssql'e gecildi (drizzle-orm@latest'te MSSEL
 * exports yok). Type-safety Zod schema validation ile telafi edilir.
 */

export interface TenantFilterOptions {
  /** tenantId kolonunun adı (genelde 'tenant_id') */
  column?: string;
}

/**
 * Tenant filtresini request'e ekler. Ornek:
 *   const req = pool.request();
 *   tenantFilter(req, tenantId);
 *   const result = await req.query('SELECT * FROM products WHERE 1=1 ' + whereClause);
 */
export function tenantFilter(
  request: sql.Request,
  tenantId: string,
  options: TenantFilterOptions = {},
): sql.Request {
  const column = options.column ?? 'tenant_id';
  return request.input('tenantId', sql.UniqueIdentifier, tenantId);
}

/**
 * Tenant filtre WHERE clause'i olusturur (parametre placeholder ile).
 * SQL sorgusuna ekleyin: 'SELECT * FROM products WHERE 1=1' + tenantWhere(...)
 */
export function tenantWhere(options: TenantFilterOptions = {}): string {
  const column = options.column ?? 'tenant_id';
  return ` AND ${column} = @tenantId`;
}

/**
 * Mevcut bir request'i pool'dan alip tenant filtresi ile donduren yardimci.
 */
export async function getTenantRequest(tenantId: string): Promise<sql.Request> {
  const pool = await getPool();
  return tenantFilter(pool.request(), tenantId);
}

/**
 * MSSQL update/insert icin ortak payload builder.
 * Field isimleri MSSEL snake_case ile ayni (Drizzle default).
 */
export const mssqlNow = (): string => new Date().toISOString();