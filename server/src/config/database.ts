import sql from 'mssql';
import { drizzle } from 'drizzle-orm/node-mssql';
import * as schema from '../db/schema';
import { env } from './env';

/**
 * MSSQL bağlantı havuzu + Drizzle ORM instance.
 *
 * - mssql.ConnectionPool: Drizzle node-mssql adapter için
 * - DATABASE_URL format: `mssql://user:password@host:port/db?encrypt=...&trustServerCertificate=...`
 *   (örn. `mssql://sa:Passw0rd@192.168.2.67:49746/DijiCatalog?encrypt=false&trustServerCertificate=true`)
 * - Drizzle MSSQL varsayılan olarak encrypt=true bekler; internal LAN
 *   bağlantılarında false + trustServerCertificate=true kullanılır.
 *
 * Kullanım:
 *   import { db, pool } from '../config/database';
 *   const rows = await db.select().from(users).where(eq(users.tenantId, tenantId));
 */

interface ParsedDbConfig {
  user: string;
  password: string;
  server: string;
  port: number;
  database: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

const parseDatabaseUrl = (url: string): ParsedDbConfig => {
  const u = new URL(url);
  // URL scheme "mssql:" — host port path'i farklı parse edilir
  // URL formatı: mssql://user:pass@host:port/database?query
  const server = u.hostname;
  const port = u.port ? parseInt(u.port, 10) : 1433;
  const database = u.pathname.replace(/^\/+/, '') || 'DijiCatalog';
  const encrypt = u.searchParams.get('encrypt') === 'true';
  const trustServerCertificate =
    u.searchParams.get('trustServerCertificate') !== 'false';
  // mssql:// scheme URL'i user/pass'i doğru parse etmez; "user:password" içeriyor
  const userInfo = u.username || '';
  const password = u.password || '';
  return {
    user: decodeURIComponent(userInfo),
    password: decodeURIComponent(password),
    server,
    port,
    database,
    encrypt,
    trustServerCertificate,
  };
};

const cfg = parseDatabaseUrl(env.DATABASE_URL);

export const pool = new sql.ConnectionPool({
  user: cfg.user,
  password: cfg.password,
  server: cfg.server,
  port: cfg.port,
  database: cfg.database,
  options: {
    encrypt: cfg.encrypt,
    trustServerCertificate: cfg.trustServerCertificate,
    enableArithAbort: true,
  },
  connectionTimeout: 15_000,
  requestTimeout: 60_000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
});

export const db = drizzle(pool, { schema });

/**
 * Graceful shutdown: tüm açık bağlantıları kapat.
 * server.ts shutdown handler'dan çağrılır.
 */
export const closePool = async (): Promise<void> => {
  await pool.close();
};

// Eager connection — app başlarken DB hazır mı kontrol etmek için
// bağlantı hatası varsa fail-fast yaparız
let connecting: Promise<void> | null = null;
export const ensureConnected = async (): Promise<void> => {
  if (pool.connected) return;
  if (!connecting) {
    connecting = pool.connect().then(() => undefined);
  }
  await connecting;
};