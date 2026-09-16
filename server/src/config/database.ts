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
  instanceName: string | null;
  database: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

export const parseDatabaseUrl = (url: string): ParsedDbConfig => {
  // mssql://user:password@host[:port|host\INSTANCE]/database?query
  // Node URL parser named instance iceren hostname'leri kabul etmez ('\\').
  // Manuel regex ile parcala.
  const m = url.match(/^mssql:\/\/([^:/?]+):([^@]+)@([^/?]+)\/([^?]+)(?:\?(.*))?$/);
  if (!m) throw new Error(`Invalid DATABASE_URL: ${url}`);
  const user = decodeURIComponent(m[1]);
  const password = decodeURIComponent(m[2]);
  const hostPart = decodeURIComponent(m[3]);
  const database = m[4] || 'DijiCatalog';
  const queryStr = m[5] || '';

  // hostPart formlari:
  //   - 'host'                  -> default instance, port 1433
  //   - 'host:port'             -> custom port (ornek: 49746)
  //   - 'host\INSTANCE'         -> named instance (SQL Browser dynamic port)
  //   - 'host\INSTANCE:port'    -> named instance + explicit port (nadir)
  let server = hostPart;
  let port: number | null = null;
  let instanceName: string | null = null;
  if (hostPart.includes('\\')) {
    // Named instance — host ile instanceName'i ayir, port yoksa SQL Browser'a birak
    const backslashIdx = hostPart.indexOf('\\');
    const afterInstance = hostPart.slice(backslashIdx + 1);
    const colonAfterInstance = afterInstance.indexOf(':');
    if (colonAfterInstance > 0) {
      // host\INSTANCE:port formu
      server = hostPart.slice(0, backslashIdx);
      instanceName = afterInstance.slice(0, colonAfterInstance);
      const p = parseInt(afterInstance.slice(colonAfterInstance + 1), 10);
      if (!isNaN(p)) port = p;
    } else {
      // host\INSTANCE formu (en yaygin)
      server = hostPart.slice(0, backslashIdx);
      instanceName = afterInstance;
      port = null;
    }
  } else {
    const colonIdx = hostPart.lastIndexOf(':');
    if (colonIdx > 0) {
      server = hostPart.slice(0, colonIdx);
      const p = parseInt(hostPart.slice(colonIdx + 1), 10);
      if (!isNaN(p)) port = p;
    }
  }

  const params = new URLSearchParams(queryStr);
  const encrypt = params.get('encrypt') === 'true';
  const trustServerCertificate = params.get('trustServerCertificate') !== 'false';

  return {
    user,
    password,
    server,
    port,
    instanceName,
    database,
    encrypt,
    trustServerCertificate,
  };
};

const cfg = parseDatabaseUrl(env.DATABASE_URL);

const basePoolOptions = {
  encrypt: cfg.encrypt,
  trustServerCertificate: cfg.trustServerCertificate,
  enableArithAbort: true,
  ...(cfg.instanceName !== null ? { instanceName: cfg.instanceName } : {}),
};

const basePoolConfig: sql.config = {
  user: cfg.user,
  password: cfg.password,
  server: cfg.server,
  ...(cfg.port !== null ? { port: cfg.port } : {}),
  database: cfg.database,
  options: basePoolOptions,
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