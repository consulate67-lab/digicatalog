#!/usr/bin/env node
/* eslint-disable */
/**
 * MSSQL Database oluşturma script'i.
 *
 * Drizzle migration uygulamadan önce hedef DB mevcut olmalı.
 * Bu script master DB'ye bağlanıp CREATE DATABASE çalıştırır.
 *
 * Kullanım:
 *   node scripts/create-mssql-db.js \
 *     --server 192.168.2.67 --port 49746 \
 *     --user sa --password 'Passw0rd!' \
 *     --database DijiCatalog
 *
 *   veya env üzerinden:
 *     MSSQL_SERVER, MSSQL_PORT, MSSQL_USER, MSSQL_PASSWORD, MSSQL_DATABASE
 */
const sql = require('mssql');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args[key] = val;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const server = args.server || process.env.MSSQL_SERVER || 'localhost';
  const port = parseInt(args.port || process.env.MSSQL_PORT || '1433', 10);
  const user = args.user || process.env.MSSQL_USER || 'sa';
  const password = args.password || process.env.MSSQL_PASSWORD || process.env.PASSWORD || '';
  const database = args.database || process.env.MSSQL_DATABASE || 'DijiCatalog';
  const instance = args.instance || process.env.MSSQL_INSTANCE; // opsiyonel named instance

  console.log(`[create-db] Sunucu: ${instance ? server + '\\' + instance : server}${port ? ':' + port : ''}`);
  console.log(`[create-db] Hedef DB: ${database}`);

  const config = {
    user,
    password,
    server,
    ...(port ? { port } : {}),
    database: 'master',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      ...(instance ? { instanceName: instance } : {}),
    },
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
  };

  let pool;
  try {
    pool = await sql.connect(config);
    console.log('[create-db] master DB bağlantısı kuruldu');

    const dbName = database;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(dbName)) {
      throw new Error(`Geçersiz DB adı: ${dbName}`);
    }

    // --drop: once drop et (yarim kalan FK'lardan kurtulmak icin)
    if (args.drop) {
      console.log(`[create-db] --drop: '${dbName}' once drop edilecek`);
      await pool.request().query(`IF DB_ID('${dbName}') IS NOT NULL BEGIN ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${dbName}]; END`);
      console.log(`[create-db] '${dbName}' dropped`);
    }

    // DB var mı kontrol et, yoksa oluştur
    const checkResult = await pool.request()
      .input('dbName', sql.NVarChar, dbName)
      .query(`SELECT DB_ID(@dbName) AS id`);
    const exists = checkResult.recordset[0]?.id;

    if (exists) {
      console.log(`[create-db] '${dbName}' DB zaten mevcut, atlanıyor`);
    } else {
      await pool.request().query(`CREATE DATABASE [${dbName}]`);
      console.log(`[create-db] '${dbName}' DB oluşturuldu`);
    }
  } catch (err) {
    console.error('[create-db] Hata:', err.message);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.close();
  }
}

main();