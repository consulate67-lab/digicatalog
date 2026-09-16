#!/usr/bin/env node
/**
 * Seed'den sonra demo user sifresini bcrypt ile resetler.
 *
 * npx tsx scripts/reset-password.js --server localhost --instance ABKA \
 *   --user sa --password 'dgfceu' --database DijiCatalog --email demo@digicatalog.local
 *
 * Sifreyi 'Demo123!' olarak set eder.
 */
const bcrypt = require('bcryptjs');
const sql = require('mssql');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v && !v.startsWith('--')) { args[k] = v; i++; }
      else args[k] = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const server = args.server || 'localhost';
  const port = args.port ? parseInt(args.port, 10) : null;
  const instance = args.instance;
  const user = args.user || 'sa';
  const password = args.password;
  const database = args.database || 'DijiCatalog';
  const email = args.email || 'demo@digicatalog.local';
  const newPassword = args.password2 || 'Demo123!';

  if (!password) {
    console.error('--password zorunlu');
    process.exit(1);
  }

  const config = {
    user, password, server,
    ...(port ? { port } : {}),
    database,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
  };

  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  console.log('[reset-password] Baglanti kuruldu');

  // Bcrypt hash
  const hash = await bcrypt.hash(newPassword, 10);
  console.log(`[reset-password] Sifre: ${newPassword} -> hash: ${hash.substring(0, 30)}...`);

  const r = await pool.request()
    .input('email', sql.NVarChar, email)
    .input('hash', sql.NVarChar, hash)
    .query(`UPDATE users SET password_hash = @hash WHERE email = @email`);
  console.log(`[reset-password] ${r.rowsAffected[0]} user updated (email: ${email})`);

  if (r.rowsAffected[0] === 0) {
    console.error('[reset-password] HATA: User bulunamadi. Once seed-mssql.sql calistirin.');
    process.exit(1);
  }

  await pool.close();
  console.log('[reset-password] Tamamlandi.');
}

main().catch((e) => { console.error('Hata:', e.message); process.exit(1); });