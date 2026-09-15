#!/usr/bin/env node
/* eslint-disable */
/**
 * MSSQL migration uygulama script'i.
 *
 * Drizzle Kit henuz mssql dialect'i desteklemedigi icin bu script
 * migrate-mssql.sql dosyasini node-mssql ile calistirir.
 *
 * SQL dosyasi GO separator ile batch'lere ayrilir ve her batch
 * ayri execute edilir. Idempotent (IF OBJECT_ID kontrolleri).
 *
 * Kullanim:
 *   node scripts/apply-migration.js --server localhost --instance ABKA --user sa --password 'xxx' --database DijiCatalog
 *   veya env: MSSQL_SERVER, MSSQL_PORT, MSSQL_INSTANCE, MSSQL_USER, MSSQL_PASSWORD, MSSQL_DATABASE
 */
const fs = require('fs');
const path = require('path');
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
  const instance = args.instance || process.env.MSSQL_INSTANCE;

  // SQL dosyasi
  const sqlPath = path.join(__dirname, 'migrate-mssql.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('[migrate] migrate-mssql.sql bulunamadi:', sqlPath);
    process.exit(1);
  }
  const sqlText = fs.readFileSync(sqlPath, 'utf8');
  // GO separator ile batch'lere ayir (case-insensitive, satir basi)
  const batches = sqlText
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  console.log(`[migrate] Sunucu: ${instance ? server + '\\' + instance : server}${port ? ':' + port : ''}`);
  console.log(`[migrate] Hedef DB: ${database}`);
  console.log(`[migrate] SQL batch sayisi: ${batches.length}`);

  const config = {
    user,
    password,
    server,
    ...(port ? { port } : {}),
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15_000,
    requestTimeout: 120_000,
  };

  let pool;
  try {
    pool = await sql.connect(config);
    console.log('[migrate] Baglanti kuruldu');

    let okCount = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      // Ilk satirdan yorumu temizle (PRINT bilgi verir)
      const firstLine = batch.split('\n')[0].trim();
      try {
        await pool.request().batch(batch);
        console.log(`[migrate] Batch ${i + 1}/${batches.length} OK (${firstLine.substring(0, 60)})`);
        okCount++;
      } catch (err) {
        console.error(`[migrate] Batch ${i + 1}/${batches.length} HATA:`);
        console.error(`  Mesaj: ${err.message}`);
        console.error(`  Ilk satir: ${firstLine}`);
        console.error(`  Batch:`);
        console.error(batch.split('\n').map((l) => '    ' + l).join('\n'));
        process.exitCode = 1;
        return;
      }
    }

    console.log(`[migrate] ${okCount}/${batches.length} batch basariyla calistirildi`);

    // Olusturulan tablolari dogrula
    const verifyResult = await pool.request()
      .input('dbName', sql.NVarChar, database)
      .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME IN ('tenants','users','categories','products','product_images','customers','catalogs','catalog_items','catalog_customers','catalog_field_config') ORDER BY TABLE_NAME`);
    console.log(`[migrate] Dogrulama: ${verifyResult.recordset.length} tablo bulundu`);
    for (const r of verifyResult.recordset) {
      console.log(`  - ${r.TABLE_NAME}`);
    }
    if (verifyResult.recordset.length !== 10) {
      console.error(`[migrate] UYARI: 10 tablo bekleniyordu, ${verifyResult.recordset.length} bulundu`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[migrate] Hata:', err.message);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.close();
  }
}

main();