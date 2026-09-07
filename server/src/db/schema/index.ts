/**
 * Drizzle schema registry.
 *
 * Her domain için ayrı dosya: src/db/schema/<table>.ts
 * Buradan re-export edilir → drizzle.config.ts ve diğer kullanıcılar
 * tek yerden import eder.
 *
 * Eklenen tablolar:
 * - tenants (Faz 1) — multi-tenant kök tablosu
 * - users (Faz 1) — kullanıcılar, tenant'a bağlı
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
