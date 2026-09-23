/**
 * Catalog Shares smoke test (Faz 9 Aşama 4.4).
 *
 * Calistirma (Korgun'da):
 *   cd C:\digicatalog\server
 *   node scripts/smoke-shares.mjs
 *
 * Test akisi:
 *   1. POST /api/auth/login (demo) → token
 *   2. GET /api/catalogs (active) → catalogId
 *   3. POST /api/catalogs/:id/shares (30 days) → 201 + accessToken
 *   4. GET /api/catalogs/:id/shares → 200 + listed
 *   5. GET /api/viewer/share/:token (no auth) → 200 + catalog data
 *   6. POST /api/catalogs/:id/shares (anonymous, no auth) → 401
 *   7. GET /api/viewer/share/invalid-token → 404
 *   8. GET /api/viewer/share/{64char-but-bogus} → 404
 *   9. DELETE /api/catalogs/:id/shares/:shareId → 204
 *  10. GET /api/viewer/share/:token (revoked) → 404
 *  11. GET /api/catalogs/:id/shares (empty list after revoke)
 *  12. POST invalid expiresInDays (0) → 400
 *  13. POST invalid email → 400
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.SMOKE_EMAIL || 'demo@digicatalog.local';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Demo123!';

let token = null;
let catalogId = null;
let shareId = null;
let accessToken = null;
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
  if (opts.useAuth !== false && token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
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
  console.log(`\n=== Catalog Shares smoke test ===`);
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

  // 3. POST share (30 days)
  {
    const { status, json } = await fetchJson(`/api/catalogs/${catalogId}/shares`, {
      method: 'POST',
      body: JSON.stringify({
        customerEmail: 'smoke-customer@example.com',
        expiresInDays: 30,
      }),
    });
    if (!expectStatus('POST /api/catalogs/:id/shares (30 days)', status, 201)) {
      console.error(json);
      process.exit(1);
    }
    if (json.data) {
      shareId = json.data.id;
      accessToken = json.data.accessToken;
      log(`   share olusturuldu`, !!shareId, `id=${shareId}`);
      log(`   accessToken 64 char`, accessToken && accessToken.length === 64,
        `len=${accessToken ? accessToken.length : 'null'}`);
      log(`   expiresAt 30 gun sonra`,
        json.data.expiresAt && new Date(json.data.expiresAt).getTime() > Date.now() + 29 * 86400000);
    }
  }

  // 4. GET shares list
  {
    const { status, json } = await fetchJson(`/api/catalogs/${catalogId}/shares`);
    if (!expectStatus('GET /api/catalogs/:id/shares', status, 200)) {
      console.error(json);
    } else if (json.data) {
      const found = json.data.find((s) => s.id === shareId);
      log(`   share listede var`, !!found);
    }
  }

  // 5. GET public viewer (no auth) — token ile
  {
    const { status, json } = await fetchJson(`/api/viewer/share/${accessToken}`, {
      useAuth: false,
    });
    if (!expectStatus('GET /api/viewer/share/:token (no auth)', status, 200)) {
      console.error(json);
    } else if (json.data) {
      log(`   shareId match`, json.data.shareId === shareId);
      log(`   catalog data var`, !!json.data.catalog);
      log(`   items >= 0`, Array.isArray(json.data.catalog?.items));
      log(`   customer email set`, json.data.customerEmail === 'smoke-customer@example.com');
    }
  }

  // 6. POST anonymous (no auth) — 401 bekleniyor
  {
    const { status } = await fetchJson(`/api/catalogs/${catalogId}/shares`, {
      method: 'POST',
      useAuth: false,
      body: JSON.stringify({ customerEmail: 'x@y.com', expiresInDays: 7 }),
    });
    if (!expectStatus('POST share anonymous (401 bekleniyor)', status, 401)) {
      console.error(`status=${status}`);
    }
  }

  // 7. GET invalid token (wrong length)
  {
    const { status } = await fetchJson('/api/viewer/share/short-token', {
      useAuth: false,
    });
    if (!expectStatus('GET invalid short token (404 bekleniyor)', status, 404)) {
      console.error(`status=${status}`);
    }
  }

  // 8. GET bogus 64-char token
  {
    const bogus = '0'.repeat(64);
    const { status } = await fetchJson(`/api/viewer/share/${bogus}`, {
      useAuth: false,
    });
    if (!expectStatus('GET bogus 64-char token (404 bekleniyor)', status, 404)) {
      console.error(`status=${status}`);
    }
  }

  // 9. DELETE share
  {
    const { status } = await fetchJson(`/api/catalogs/${catalogId}/shares/${shareId}`, {
      method: 'DELETE',
    });
    if (!expectStatus('DELETE share', status, 204)) {
      console.error(`status=${status}`);
    }
  }

  // 10. GET revoked token → 404
  {
    const { status } = await fetchJson(`/api/viewer/share/${accessToken}`, {
      useAuth: false,
    });
    if (!expectStatus('GET revoked token (404 bekleniyor)', status, 404)) {
      console.error(`status=${status}`);
    }
  }

  // 11. GET shares list — share artik yok
  {
    const { status, json } = await fetchJson(`/api/catalogs/${catalogId}/shares`);
    if (!expectStatus('GET shares list (after revoke)', status, 200)) {
      console.error(json);
    } else if (json.data) {
      const stillThere = json.data.find((s) => s.id === shareId);
      log(`   revoked share listede yok`, !stillThere);
    }
  }

  // 12. POST invalid expiresInDays (0)
  {
    const { status } = await fetchJson(`/api/catalogs/${catalogId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ customerEmail: 'x@y.com', expiresInDays: 0 }),
    });
    if (!expectStatus('POST invalid expiresInDays=0 (400 bekleniyor)', status, 400)) {
      console.error(`status=${status}`);
    }
  }

  // 13. POST invalid email
  {
    const { status } = await fetchJson(`/api/catalogs/${catalogId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ customerEmail: 'not-an-email', expiresInDays: 7 }),
    });
    if (!expectStatus('POST invalid email (400 bekleniyor)', status, 400)) {
      console.error(`status=${status}`);
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
