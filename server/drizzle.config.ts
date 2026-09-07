import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Drizzle Kit konfigürasyonu.
 *
 * Komutlar:
 *   npm run db:generate  — Schema'dan SQL migration üretir (DB gerektirmez)
 *   npm run db:push      — Schema'yı doğrudan DB'ye uygular (dev only)
 *   npm run db:migrate   — Migration'ı çalıştırır
 *   npm run db:studio    — Local DB GUI
 *
 * Faz 1'den itibaren domain schema dosyaları src/db/schema/ altında olacak,
 * src/db/schema/index.ts hepsini re-export edecek.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/digicatalog',
  },
  verbose: true,
  strict: true,
});
