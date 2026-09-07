/**
 * Drizzle schema registry.
 *
 * Her domain için ayrı dosya: src/db/schema/<table>.ts
 * Buradan re-export edilir → drizzle.config.ts ve diğer kullanıcılar
 * tek yerden import eder.
 *
 * Örnek (Faz 1'den itibaren):
 *   export * from './tenants';
 *   export * from './users';
 *   export * from './products';
 *
 * Şu an boş — Faz 0 commit 2'de sadece iskelet kuruluyor, gerçek tablolar
 * Faz 1'de (tenants, users) eklenecek.
 */

// İleride:
// export * from './tenants';
// export * from './users';

// Empty export — TypeScript'ın modül olarak tanıması için (Faz 0'da zorunlu)
// Faz 1'de ilk gerçek export eklendiğinde bu satır kaldırılabilir.
export {};
