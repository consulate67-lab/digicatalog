/**
 * Drizzle Kit config (placeholder).
 *
 * Drizzle Kit henuz mssql dialect'i desteklemiyor, bu yuzden
 * migration scripts/migrate-mssql.sql ile manuel uygulaniyor.
 *
 * Drizzle ORM runtime'da (drizzle-orm/node-mssql) TypeScript
 * schema'sini kullaniyor; ayri bir config dosyasi gerekmez.
 *
 * Bu dosya ileride Drizzle Kit mssel destegi eklediginde
 * tekrar aktif edilebilir.
 */

export default {
  dialect: 'postgresql', // placeholder
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: 'mssql://localhost/DijiCatalog',
  },
};