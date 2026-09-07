import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { env } from './env';

/**
 * PostgreSQL bağlantı havuzu + Drizzle ORM instance.
 *
 * - Pool: pg modülünün default pool'u (max 10 bağlantı)
 * - Drizzle: node-postgres adapter + schema re-export
 * - SSL: production'da aktif (Railway PostgreSQL zorunlu kılar)
 *
 * Kullanım:
 *   import { db, pool } from '../config/database';
 *   const rows = await db.select().from(users).where(eq(users.tenantId, tenantId));
 */
const isProduction = env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

/**
 * Graceful shutdown: tüm açık bağlantıları kapat.
 * server.ts shutdown handler'dan çağrılır.
 */
export const closePool = async (): Promise<void> => {
  await pool.end();
};
