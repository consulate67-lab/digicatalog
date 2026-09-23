/**
 * PDF Templates smoke test (Faz 9 Aşama 2.4).
 *
 * Node.js ESM script. PowerShell Invoke-RestMethod hashtable edge
 * case'lerinden kacinmak icin Node fetch ile yazildi.
 *
 * Calistirma (Korgun'da):
 *   cd C:\digicatalog\server
 *   node scripts/smoke-pdf-templates.mjs
 *
 * veya env override ile:
 *   $env:BASE_URL="http://192.168.2.67:3000"; node scripts/smoke-pdf-templates.mjs
 *
 * Ne yapar:
 *   1. POST /api/auth/login (demo@digicatalog.local / Demo123!)
 *   2. GET /api/admin/pdf-templates (24 sistem preset bekleniyor)
 *   3. GET /api/admin/pdf-templates/:id (tek sistem sablonu)
 *   4. POST custom sablon (201 + slug uniq)
 *   5. PATCH custom sablon (200)
 *   6. PATCH sistem sablonu (403 bekleniyor)
 *   7. DELETE custom sablon (204)
 *   8. POST duplicate slug (409 bekleniyor)
 *
 * Pass/fail per step, exit code 0 (all pass) veya 1 (any fail).
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.SMOKE_EMAIL || 'demo@digicatalog.local';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Demo123!';

let token = null;
let createdId = null;
let systemId = null;
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

const expectStatus = (label, actual, expected) => {
  const ok = actual === expected;
  log(label, ok, `status=${actual} (expected ${expected})`);
  return ok;
};

const main = async () => {
  console.log(`\n=== PDF Templates smoke test ===`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`User:     ${EMAIL}\n`);

  // 1. Login
  {
    const { status, json } = await fetchJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!expectStatus('POST /api/auth/login', status, 200)) {
      console.error('Login response:', json);
      process.exit(1);
    }
    token = json.tokens.accessToken;
    if (!token) {
      console.error('Token yok, login response:', json);
      process.exit(1);
    }
    console.log(`   token alindi (${token.length} karakter)\n`);
  }

  // 2. GET list (24 preset bekleniyor)
  {
    const { status, json } = await fetchJson('/api/admin/pdf-templates?pageSize=100');
    if (!expectStatus('GET /api/admin/pdf-templates (list)', status, 200)) {
      console.error(json);
      process.exit(1);
    }
    const total = json.pagination?.total;
    const items = json.data || [];
    const categories = [...new Set(items.map((i) => i.category))].sort();
    log(`   list total >= 24 (preset'ler seed edilmis)`, total >= 24, `total=${total}`);
    log(`   8 kategori mevcut`, categories.length === 8, `categories=${categories.join(',')}`);
    if (items.length > 0) systemId = items.find((i) => i.isSystem)?.id;
  }

  // 3. GET one (system template)
  if (systemId) {
    const { status, json } = await fetchJson(`/api/admin/pdf-templates/${systemId}`);
    if (!expectStatus('GET /api/admin/pdf-templates/:id (system)', status, 200)) {
      console.error(json);
    } else if (json.data) {
      log(`   system template layout_json parse OK`, typeof json.data.layout === 'object');
    }
  }

  // 4. POST custom
  {
    const slug = `smoke-test-${Date.now()}`;
    const { status, json } = await fetchJson('/api/admin/pdf-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Smoke Test Custom',
        slug,
        description: 'Smoke test tarafindan olusturuldu',
        category: 'custom',
        layout: {
          pageSize: 'A4',
          orientation: 'portrait',
          colors: { primary: '#FF0000', accent: '#00FF00' },
          productCard: { style: 'grid', columns: 2 },
        },
      }),
    });
    if (!expectStatus('POST /api/admin/pdf-templates (custom)', status, 201)) {
      console.error(json);
    } else if (json.data) {
      createdId = json.data.id;
      log(`   custom olusturuldu`, !!createdId, `id=${createdId}`);
    }
  }

  // 5. PATCH custom
  if (createdId) {
    const { status, json } = await fetchJson(`/api/admin/pdf-templates/${createdId}`, {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Smoke test guncellendi' }),
    });
    if (!expectStatus('PATCH custom template', status, 200)) {
      console.error(json);
    } else {
      log(`   description guncellendi`, json.data?.description === 'Smoke test guncellendi');
    }
  }

  // 6. PATCH system template (403 bekleniyor)
  if (systemId) {
    const { status, json } = await fetchJson(`/api/admin/pdf-templates/${systemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Hacked' }),
    });
    if (!expectStatus('PATCH system template (403 bekleniyor)', status, 403)) {
      console.error(json);
    }
  }

  // 7. DELETE custom
  if (createdId) {
    const { status } = await fetchJson(`/api/admin/pdf-templates/${createdId}`, {
      method: 'DELETE',
    });
    if (!expectStatus('DELETE custom template', status, 204)) {
      console.error(`status=${status}`);
    }
  }

  // 8. POST duplicate slug (409)
  // Once yeni bir custom olustur, sonra ayni slug ile tekrar dene
  {
    const slug = `smoke-dup-${Date.now()}`;
    const r1 = await fetchJson('/api/admin/pdf-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Smoke Dup Test 1',
        slug,
        layout: { pageSize: 'A4' },
      }),
    });
    if (r1.status === 201) {
      const r2 = await fetchJson('/api/admin/pdf-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Smoke Dup Test 2',
          slug,
          layout: { pageSize: 'A4' },
        }),
      });
      if (!expectStatus('POST duplicate slug (409 bekleniyor)', r2.status, 409)) {
        console.error(r2.json);
      }
      // Cleanup
      await fetchJson(`/api/admin/pdf-templates/${r1.json.data.id}`, { method: 'DELETE' });
    } else {
      log('POST duplicate slug (setup)', false, `setup status=${r1.status}`);
    }
  }

  // 9. Validation: invalid slug
  {
    const { status, json } = await fetchJson('/api/admin/pdf-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invalid Slug',
        slug: 'INVALID UPPERCASE WITH SPACES',
        layout: {},
      }),
    });
    if (!expectStatus('POST invalid slug (400 bekleniyor)', status, 400)) {
      console.error(json);
    }
  }

  // === Summary ===
  console.log(`\n=== Summary: ${passCount} pass, ${failCount} fail ===`);
  process.exit(failCount === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error('Smoke test crash:', err);
  process.exit(1);
});
