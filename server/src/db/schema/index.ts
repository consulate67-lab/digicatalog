/**
 * Drizzle schema registry (MSSQL dialect).
 *
 * Her domain için ayrı dosya: src/db/schema/<table>.ts
 * Buradan re-export edilir → drizzle.config.ts ve diğer kullanıcılar
 * tek yerden import eder.
 *
 * Tablolar:
 * - tenants — multi-tenant kök tablosu
 * - users — kullanıcılar, tenant'a bağlı
 * - categories — tenant-scoped, self-referencing tree
 * - products — domain'in ana tablosu
 * - productImages — ürün görselleri (base64)
 * - customers — müşteri/cari kartları
 * - catalogs — kataloglar
 * - catalogItems — katalogdaki ürünler
 * - catalogCustomers — katalog-müşteri ataması
 * - catalogFieldConfig — katalogda görünecek alanlar
 *
 * MSSQL'e geçiş: önceki PG dialect şemaları .trash-2026-09-15-schema-pg/
 * altında yedekli.
 */

export * from './tenants';
export * from './users';
export * from './categories';
export * from './products';
export * from './productImages';
export * from './customers';
export * from './catalogs';
export * from './catalogItems';
export * from './catalogCustomers';
export * from './catalogFieldConfig';