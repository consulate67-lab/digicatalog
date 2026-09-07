#!/usr/bin/env node
/**
 * Railway deployment helper.
 *
 * Railway shell'de veya `railway run` ile calistirin:
 *   node server/scripts/deploy-helper.cjs
 *
 * Yapar:
 * 1) DATABASE_URL kontrolu
 * 2) Migration'lari sirayla calistir (4 migration)
 * 3) Health check (opsiyonel, /api/ping)
 * 4) Demo seed (DEMO_SEED=1 env ile)
 *
 * Bu script production-ready: idempotent (var olan tablo varsa skip
 * eder), hata durumunda acık mesaj verir.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..', '..');
process.chdir(root);

const log = (msg) => console.log(`[deploy-helper] ${msg}`);

if (!process.env.DATABASE_URL) {
  log('❌ DATABASE_URL tanimli degil. Railway shell otomatik set eder — kontrol et.');
  process.exit(1);
}

log('DATABASE_URL: ' + process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'));

// === 1) Migration ===
log('--- Migration ---');
const mig = spawnSync('npx', ['drizzle-kit', 'migrate', '--config=server/drizzle.config.ts'], {
  stdio: 'inherit',
  shell: true,
});
if (mig.status !== 0) {
  log('❌ Migration basarisiz');
  process.exit(1);
}
log('✅ Migration tamam');

// === 2) Demo seed (opsiyonel) ===
if (process.env.DEMO_SEED === '1' || process.env.DEMO_SEED === 'true') {
  log('--- Demo seed (DEMO_SEED=1) ---');
  const seed = spawnSync('npx', ['tsx', 'server/scripts/seed-demo.ts'], {
    stdio: 'inherit',
    shell: true,
  });
  if (seed.status !== 0) {
    log('⚠️ Seed basarisiz (devam ediliyor)');
  } else {
    log('✅ Demo seed tamam');
  }
}

// === 3) Health check (opsiyonel) ===
if (process.env.HEALTH_CHECK_URL) {
  log('--- Health check ---');
  const url = process.env.HEALTH_CHECK_URL;
  const http = require('http');
  const req = http.get(url + '/api/ping', (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      if (res.statusCode === 200) {
        log(`✅ Health check OK: ${body.substring(0, 200)}`);
      } else {
        log(`❌ Health check FAILED: HTTP ${res.statusCode}`);
      }
    });
  });
  req.on('error', (err) => log(`❌ Health check error: ${err.message}`));
  req.setTimeout(10000, () => req.destroy());
  setTimeout(() => {
    log('🎉 Deploy helper tamamlandi');
    process.exit(0);
  }, 12000);
} else {
  log('🎉 Deploy helper tamamlandi (health check icin HEALTH_CHECK_URL env set edin)');
  process.exit(0);
}
