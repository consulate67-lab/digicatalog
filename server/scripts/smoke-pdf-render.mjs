/**
 * PDF Render smoke test (Faz 9 Aşama 3.4).
 *
 * Template-aware PDF generation + catalog_pdf_settings endpoints.
 *
 * Calistirma (Korgun'da):
 *   cd C:\digicatalog\server
 *   node scripts/smoke-pdf-render.mjs
 *
 * Test akisi:
 *   1. POST /api/auth/login → token
 *   2. GET  /api/catalogs (active olan) → catalogId
 *   3. GET  /api/admin/pdf-templates (modern-bold, classic-clean,
 *       magazine-editorial) → 3 templateId
 *   4. POST /api/catalogs/:id/pdf/full (her templateId) → PDF bytes
 *      - Header check: %PDF-
 *      - Size > 1000 (gercekten icerik var)
 *   5. POST /api/catalogs/:id/pdf/full (templateId=null, default) → PDF
 *   6. GET  /api/catalogs/:id/pdf-settings → 200 + fallback templateId
 *   7. PUT  /api/catalogs/:id/pdf-settings → 200
 *   8. POST /api/catalogs/:id/pdf/full (templateId=customCoverTitle ile
 *      degeri degismis olmali) → PDF (sadece boyut check)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.SMOKE_EMAIL || 'demo@digicatalog.local';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Demo123!';

const TEMPLATES_TO_TEST = ['modern-bold', 'classic-clean', 'magazine-editorial'];

let token = null;
let catalogId = null;
const templateIds = new Map(); // slug -> id
const pdfSizes = new Map(); // label -> bytes
let passCount = 0;
let failCount = 0;

const log = (label, ok, info = '') => {
  const status = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`[${status}] ${label}${info ? ' — ' + info : ''}`);
  if (ok) passCount++; else failCount++;
};

const fetchJson = async (path, opts = {}) => {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* not json */ }
  return { status: res.status, json, text };
};

const fetchBytes = async (path, opts = {}) => {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, bytes: buf };
};

const expectStatus = (label, actual, expected) => {
  const ok = actual === expected;
  log(label, ok, `status=${actual} (expected ${expected})`);
  return ok;
};

const main = async () => {
  console.log(`\n=== PDF Render smoke test ===`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`User:     ${EMAIL}\n`);

  // 1. Login
  {
    const { status, json } = await fetchJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!expectStatus('POST /api/auth/login', status, 200)) {
      console.error(json);
      process.exit(1);
    }
    token = json.tokens.accessToken;
    console.log(`   token alindi (${token.length} karakter)\n`);
  }

  // 2. Demo catalog id (active olan)
  {
    const { status, json } = await fetchJson('/api/catalogs?status=active&pageSize=10');
    if (!expectStatus('GET /api/catalogs?status=active', status, 200)) {
      console.error(json);
      process.exit(1);
    }
    const items = json.data || [];
    if (items.length === 0) {
      console.error('Aktif katalog bulunamadi — once seed-demo calistirin');
      process.exit(1);
    }
    catalogId = items[0].id;
    log(`   ilk aktif katalog secildi`, true, `id=${catalogId}, name=${items[0].name}`);
  }

  // 3. 3 template id
  {
    const { status, json } = await fetchJson('/api/admin/pdf-templates?pageSize=100');
    if (!expectStatus('GET /api/admin/pdf-templates', status, 200)) {
      console.error(json);
      process.exit(1);
    }
    const items = json.data || [];
    for (const slug of TEMPLATES_TO_TEST) {
      const found = items.find((i) => i.slug === slug);
      if (!found) {
        log(`   template slug='${slug}' bulunamadi`, false, 'seed calistirin');
        process.exit(1);
      }
      templateIds.set(slug, found.id);
    }
    log(`   3 template secildi`, true,
      `slugs=${TEMPLATES_TO_TEST.join(',')}`);
  }

  // 4. Her template ile PDF uret
  for (const slug of TEMPLATES_TO_TEST) {
    const templateId = templateIds.get(slug);
    const { status, bytes } = await fetchBytes(`/api/catalogs/${catalogId}/pdf/full`, {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    });
    if (!expectStatus(`POST pdf/full templateId=${slug}`, status, 200)) {
      continue;
    }
    // Header check
    const magic = bytes.subarray(0, 5).toString();
    const isPdf = magic === '%PDF-';
    const sizeOk = bytes.length > 1000;
    log(`   ${slug}: header %PDF-`, isPdf, `magic="${magic}"`);
    log(`   ${slug}: size > 1000 bytes`, sizeOk, `bytes=${bytes.length}`);
    pdfSizes.set(slug, bytes.length);
  }

  // 5. Default layout (templateId=null)
  {
    const { status, bytes } = await fetchBytes(`/api/catalogs/${catalogId}/pdf/full`, {
      method: 'POST',
      body: JSON.stringify({ templateId: null }),
    });
    if (!expectStatus('POST pdf/full templateId=null (default)', status, 200)) {
      console.error(`status=${status}`);
    } else {
      const magic = bytes.subarray(0, 5).toString();
      log(`   default: header %PDF-`, magic === '%PDF-', `magic="${magic}"`);
      log(`   default: size > 1000`, bytes.length > 1000, `bytes=${bytes.length}`);
      pdfSizes.set('default', bytes.length);
    }
  }

  // 6. GET pdf-settings (default + fallback template)
  {
    const { status, json } = await fetchJson(`/api/catalogs/${catalogId}/pdf-settings`);
    if (!expectStatus('GET pdf-settings', status, 200)) {
      console.error(json);
    } else if (json.data) {
      const s = json.data;
      log(`   templateId fallback set`, !!s.templateId, `templateId=${s.templateId}`);
      log(`   showLogo=true default`, s.showLogo === true);
      log(`   showQrCode=false default`, s.showQrCode === false);
    }
  }

  // 7. PUT pdf-settings (modern-bold + custom cover title)
  let updatedSettings = null;
  {
    const modernId = templateIds.get('modern-bold');
    const body = {
      templateId: modernId,
      showLogo: true,
      showPhone: false,
      showEmail: false,
      showAddress: true,
      showInstagram: false,
      showFacebook: false,
      showWebsite: true,
      showQrCode: false,
      customCoverTitle: 'Smoke Test Ozel Kapak 2026',
      customFooterText: 'Smoke test tarafindan olusturuldu',
      qrLinkUrl: null,
    };
    const { status, json } = await fetchJson(`/api/catalogs/${catalogId}/pdf-settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!expectStatus('PUT pdf-settings', status, 200)) {
      console.error(json);
    } else if (json.data) {
      updatedSettings = json.data;
      log(`   templateId updated`, updatedSettings.templateId === modernId);
      log(`   customCoverTitle saved`,
        updatedSettings.customCoverTitle === body.customCoverTitle);
      log(`   showPhone toggled off`,
        updatedSettings.showPhone === false);
    }
  }

  // 8. PDF uret updated settings ile — boyut kontrol
  {
    const { status, bytes } = await fetchBytes(`/api/catalogs/${catalogId}/pdf/full`, {
      method: 'POST',
      body: JSON.stringify({ templateId: templateIds.get('modern-bold') }),
    });
    if (!expectStatus('POST pdf/full (updated settings)', status, 200)) {
      console.error(`status=${status}`);
    } else {
      const magic = bytes.subarray(0, 5).toString();
      log(`   updated render: header %PDF-`, magic === '%PDF-', `magic="${magic}"`);
      log(`   updated render: size > 1000`, bytes.length > 1000, `bytes=${bytes.length}`);
    }
  }

  // 9. PUT invalid templateId (400 bekleniyor)
  {
    const { status } = await fetchJson(`/api/catalogs/${catalogId}/pdf-settings`, {
      method: 'PUT',
      body: JSON.stringify({
        templateId: '00000000-0000-0000-0000-000000000000',
      }),
    });
    if (!expectStatus('PUT pdf-settings invalid templateId (400 bekleniyor)', status, 400)) {
      console.error(`status=${status}`);
    }
  }

  // === Summary ===
  console.log(`\n=== Summary: ${passCount} pass, ${failCount} fail ===`);
  if (pdfSizes.size > 0) {
    console.log('\nPDF boyutlari:');
    for (const [label, size] of pdfSizes) {
      console.log(`  ${label}: ${size} bytes`);
    }
  }
  process.exit(failCount === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error('Smoke test crash:', err);
  process.exit(1);
});
