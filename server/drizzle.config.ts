import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Drizzle Kit konfigürasyonu (MSSQL dialect).
 *
 * Komutlar:
 *   npm run db:generate  - Schema'dan SQL migration üretir (DB gerektirmez)
 *   npm run db:push      - Schema'yı doğrudan DB'ye uygular (dev only)
 *   npm run db:migrate   - Migration'ı çalıştırır
 *   npm run db:studio    - Local DB GUI
 *
 * DATABASE_URL formatı: mssql://user:password@host:port/database?encrypt=...
 *
 * Faz 1'den itibaren domain schema dosyaları src/db/schema/ altında,
 * src/db/schema/index.ts hepsini re-export ediyor.
 */
export default defineConfig({
  dialect: 'mssql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'mssql://sa:Password123@localhost:1433/DijiCatalog?encrypt=false&trustServerCertificate=true',
  },
  verbose: true,
  strict: true,
});