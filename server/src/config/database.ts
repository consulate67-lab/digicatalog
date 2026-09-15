import sql from 'mssql';
import { env } from './env';

/**
 * MSSQL baglanti havuzu + getPool helper.
 *
 * - mssql.ConnectionPool: Drizzle ORM kullanmiyoruz (drizzle-orm'de MSSEL exports yok),
 *   tüm service'ler raw mssql ile calisiyor.
 * - DATABASE_URL format: `mssql://user:password@host[:port]/db?encrypt=...&trustServerCertificate=...`
 *   Named instance icin: `mssql://user:pass@host\INSTANCE/db?...` (port yok, SQL Browser)
 *   Ornek: `mssql://sa:Passw0rd@localhost\ABKA/DijiCatalog?encrypt=false&trustServerCertificate=true`
 *
 * Kullanim:
 *   import { pool, getPool } from '../config/database';
 *   const p = await getPool();
 *   const r = await p.request().input('id', sql.NVarChar, id).query('SELECT ...');
 */

interface ParsedDbConfig {
  user: string;
  password: string;
  server: string;
  port: number | null;
  database: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

const parseDatabaseUrl = (url: string): ParsedDbConfig => {
  const u = new URL(url);
  // URL format: mssql://user:pass@host[:port|host\INSTANCE]/database?query
  // host kismi hem port hem named instance icerebilir
  // mssql package semantik: server = 'host\INSTANCE' veya 'host', port sadece direct baglanti icin
  const rawServer = u.hostname;
  let server = rawServer;
  let port: number | null = null;
  // Host icinde backslash varsa (named instance) veya yoksa
  // URL parser hostname'de backslash'i farkli isleyebilir; manuel kontrol
  if (rawServer.includes('\\')) {
    // Named instance — port SQL Browser tarafindan cozumlenir
    server = rawServer;
    port = null;
  } else if (u.port) {
    port = parseInt(u.port, 10);
  }
  const database = u.pathname.replace(/^\/+/, '') || 'DijiCatalog';
  const encrypt = u.searchParams.get('encrypt') === 'true';
  const trustServerCertificate =
    u.searchParams.get('trustServerCertificate') !== 'false';
  return {
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    server,
    port,
    database,
    encrypt,
    trustServerCertificate,
  };
};

const cfg = parseDatabaseUrl(env.DATABASE_URL);

const basePoolConfig: sql.config = {
  user: cfg.user,
  password: cfg.password,
  server: cfg.server,
  ...(cfg.port !== null ? { port: cfg.port } : {}),
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
};

export const pool = new sql.ConnectionPool(basePoolConfig);

// Lazy + memoized connect
let connecting: Promise<sql.ConnectionPool> | null = null;
export const getPool = async (): Promise<sql.ConnectionPool> => {
  if (pool.connected) return pool;
  if (!connecting) {
    connecting = pool.connect();
  }
  return connecting;
};

/**
 * Graceful shutdown: tüm acik baglantilari kapat.
 * server.ts shutdown handler'dan cagrilir.
 */
export const closePool = async (): Promise<void> => {
  await pool.close();
};