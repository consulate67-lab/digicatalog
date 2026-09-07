# DijiCatalog — 8 Aşama Geliştirme Planı

> **Durum:** Faz 0 devam ediyor. Her aşama kendi başına demo edilebilir, commit'ler temizdir.

## Vizyon

Multi-tenant SaaS — her kiracı kendi ERP'sinden ürün/müşteri verisini çeker, kategorilere göre "hızlı bant" filtre sistemi ile müşteriye özel görsel PDF kataloglar oluşturur.

## 16 Gereksinim → Fazlara Dağılımı

| # | Gereksinim | Faz |
|---|---|---|
| 1 | Kiralanabilir SaaS (multi-tenant) | Faz 1 (row-level isolation) |
| 2 | Web admin sayfası | Faz 0 (scaffold) + Faz 1 (auth) + Faz 2-5 (UI) |
| 3 | Üye bilgileri (auth) | Faz 1 |
| 4 | Railway deploy | Faz 0 (config) + Faz 8 (deploy) |
| 5 | PostgreSQL | Faz 0 (drizzle setup) |
| 6 | Manuel ürün tanıtımı | Faz 2 |
| 7 | Toplu ürün tanıtımı (Excel/XML) | Faz 2 |
| 8 | base64 resim DB'de | Faz 2 |
| 9 | ERP entegrasyonu | Faz 4 |
| 10 | Katalogda gösterilecek alanlar | Faz 5 (catalog config) |
| 11 | Kategori bazlı gösterim | Faz 2 (kategori) + Faz 6 (viewer) |
| 12 | Çoklu müşteri seçimi (ERP/bulk/excel) | Faz 3 + Faz 5 |
| 13 | Hızlı bant filtre | Faz 5 |
| 14 | Resimli PDF katalog | Faz 7 |
| 15 | Katalogdan PDF export (full/partial) | Faz 7 |
| 16 | Detay modal (büyük resim + özellikler) | Faz 6 |

---

## Faz 0 — Altyapı 🟡 (devam ediyor)

**Hedef:** Çalışan monorepo: server sağlık check + client landing sayfası.

**Çıktılar:**
- npm workspaces monorepo (`server` + `client`)
- Server: Express + TypeScript + Drizzle config + `/api/ping`
- Client: Vite + React + TypeScript + Tailwind + landing
- Railway config (root `railway.toml`)
- README, AGENTS.md, PLAN.md, .gitignore

**Commit'ler (2):**
1. `chore: monorepo scaffold` — root config, workspaces, docs
2. `feat: server + client base scaffolding` — server boots, client renders

---

## Faz 1 — Auth & Multi-tenant (3 commit)

**Hedef:** Tenant kayıt, login, JWT, row-level izolasyon.

**DB Tabloları:**
- `tenants` (id, name, slug, erp_provider, created_at, updated_at)
- `users` (id, tenant_id FK, email UNIQUE, password_hash, role, created_at)

**Endpoint'ler:**
- `POST /api/auth/register` → tenant + ilk admin user oluştur
- `POST /api/auth/login` → access + refresh token
- `POST /api/auth/refresh` → yeni access token
- `GET /api/auth/me` → mevcut user

**Middleware:**
- `authMiddleware` → JWT doğrula, `req.user` + `req.tenantId` set
- `requireRole('admin')` → rol kontrolü
- `tenantFilter` → Drizzle query helper'ları (`withTenant(qb, tenantId)`)

**Commit'ler:**
1. `feat(db): tenants + users schema`
2. `feat(auth): register/login/JWT + middleware`
3. `feat(client): login page + auth context + protected routes`

---

## Faz 2 — Ürün Yönetimi (4 commit)

**Hedef:** Manuel CRUD + Excel/XML bulk import + base64 resim.

**DB Tabloları:**
- `categories` (id, tenant_id, name, slug, parent_id, sort_order)
- `products` (id, tenant_id, sku, name, description, price, currency, category_id, brand, unit, notes, attributes JSONB, is_active, created_at, updated_at)
- `product_images` (id, tenant_id, product_id, base64_data TEXT, mime_type, sort_order, is_primary, created_at)

**Endpoint'ler:**
- `GET/POST /api/products`, `GET/PUT/DELETE /api/products/:id`
- `GET/POST /api/categories`, `PUT/DELETE /api/categories/:id`
- `POST /api/products/import/excel` (multipart) → parse → bulk insert
- `POST /api/products/import/xml` (text/xml) → parse → bulk insert
- `POST /api/products/:id/images` (multipart) → base64 encode → DB

**Commit'ler:**
1. `feat(db): products + categories + product_images schema`
2. `feat(api): product + category CRUD`
3. `feat(api): Excel + XML bulk import`
4. `feat(client): product management UI (list, form, image upload, import)`

---

## Faz 3 — Müşteri Yönetimi (2 commit)

**Hedef:** Manuel müşteri CRUD + Excel bulk import.

**DB Tabloları:**
- `customers` (id, tenant_id, name, email, phone, address, erp_customer_id NULLABLE, source 'manual'|'excel'|'erp', notes, created_at, updated_at)

**Endpoint'ler:**
- `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/:id`
- `POST /api/customers/import/excel` (multipart)

**Commit'ler:**
1. `feat(db + api): customers schema + CRUD + Excel import`
2. `feat(client): customer management UI`

---

## Faz 4 — ERP Entegrasyon Altyapısı (2 commit)

**Hedef:** Adapter pattern, mock provider, ürün/müşteri senkronizasyonu.

**Yapı:**
- `src/integrations/erp/BaseErpAdapter.ts` → abstract class/interface
  - `ping(): Promise<boolean>`
  - `fetchProducts(): Promise<ErpProduct[]>`
  - `fetchCustomers(): Promise<ErpCustomer[]>`
- `src/integrations/erp/MockErpProvider.ts` → JSON seed
- `src/integrations/erp/index.ts` → provider registry
- `tenants.erp_provider` + `tenants.erp_config JSONB` (URL, API key, vs.)

**Endpoint'ler:**
- `POST /api/integrations/erp/test` → provider ping
- `POST /api/integrations/erp/sync/products` → fetch + upsert
- `POST /api/integrations/erp/sync/customers` → fetch + upsert

**Commit'ler:**
1. `feat(erp): BaseErpAdapter interface + MockProvider + tenant config`
2. `feat(erp): sync endpoints + admin UI for ERP config`

---

## Faz 5 — Katalog Motoru (3 commit)

**Hedef:** Çoklu müşterili katalog oluşturma, hızlı bant filtre, alan görünürlüğü.

**DB Tabloları:**
- `catalogs` (id, tenant_id, name, description, status, created_by, created_at, updated_at)
- `catalog_items` (catalog_id, product_id, sort_order, custom_price NULLABLE, custom_notes)
- `catalog_customers` (catalog_id, customer_id) → many-to-many
- `catalog_field_config` (catalog_id, field_name, is_visible, sort_order)

**Endpoint'ler:**
- `GET/POST /api/catalogs`
- `POST /api/catalogs/:id/customers` → çoklu müşteri ata
- `POST /api/catalogs/:id/items` → ürün ekle (toplu)
- `PATCH /api/catalogs/:id/fields` → alan görünürlüğü
- `GET /api/catalogs/:id/preview` → filtre uygulanmış ürün listesi

**Filtre Sistemi ("Hızlı Bant"):**
- Fiyat aralığı (min/max chip)
- Kategori (multi-select chip)
- Marka (multi-select chip)
- Etiket/özel atribut (JSONB'den dinamik)
- UI: her filtre için tek satır chip grubu, toggle mantığı

**Commit'ler:**
1. `feat(db): catalogs + catalog_items + catalog_customers + field_config schema`
2. `feat(api): catalog CRUD + customer assignment + filter API`
3. `feat(client): catalog wizard + filter UI + product picker`

---

## Faz 6 — Ürün Tanıtım Ekranı & Modal (2 commit)

**Hedef:** Public viewer, kategori navigasyonu, detay modal.

**Sayfalar:**
- `/viewer/:catalogId` → public (auth gerektirmez, link bazlı erişim)
  - Sol: kategori ağacı
  - Sağ: ürün grid (görünürlük ayarlarına göre)
  - Üst: arama + sıralama
- Modal: tıklanan ürünün büyük resmi + tüm özellikler + fiyat + notlar

**Commit'ler:**
1. `feat(api): public viewer endpoint (no-auth, link-based)`
2. `feat(client): viewer page + category tree + product cards + detail modal`

---

## Faz 7 — PDF Üretimi (3 commit)

**Hedef:** Server-side PDF (pdfkit), full + seçili ürün export.

**Endpoint'ler:**
- `POST /api/catalogs/:id/pdf/full` → async job → PDF URL
- `POST /api/catalogs/:id/pdf/selected` → body: { productIds[] } → async job → PDF URL
- `GET /api/pdf/jobs/:jobId` → status (pending, completed, failed)
- `GET /api/pdf/jobs/:jobId/download` → stream PDF

**PDF Yapısı:**
- Kapak: katalog adı, müşteri listesi, tarih
- İçindekiler: kategori listesi
- Kategori bölümleri: her sayfada 1-4 ürün, büyük resim + isim + fiyat + notlar
- Footer: sayfa no, katalog adı

**Commit'ler:**
1. `feat(pdf): pdfkit base + katalog template engine`
2. `feat(pdf): async job system (BullMQ veya in-memory queue)`
3. `feat(client): PDF export buttons + download UI`

---

## Faz 8 — Polish & Deploy (2 commit)

**Hedef:** Production-ready, Railway'de çalışıyor.

**Checklist:**
- ✅ CORS sıkılaştırma (ALLOWED_ORIGINS zorunlu)
- ✅ Rate limit (express-rate-limit, auth + import endpoint'leri)
- ✅ Helmet (CSP, HSTS)
- ✅ Env validation tam (zod, tüm env'ler zorunlu)
- ✅ Pino structured logging (production)
- ✅ Error monitoring (opsiyonel Sentry)
- ✅ Seed data + demo tenant
- ✅ README production guide
- ✅ Railway deploy (env, health check, auto-deploy)
- ✅ Test (vitest, supertest) — core domain %80+ coverage

**Commit'ler:**
1. `chore(security): helmet, CORS, rate limit, env validation hardening`
2. `chore(deploy): Railway config polish + demo seed + production README`

---

## Tahmini Commit Sayısı

| Faz | Commit |
|---|---|
| 0 | 2 |
| 1 | 3 |
| 2 | 4 |
| 3 | 2 |
| 4 | 2 |
| 5 | 3 |
| 6 | 2 |
| 7 | 3 |
| 8 | 2 |
| **Toplam** | **23 commit** |

**Tahmini süre:** Tek geliştirici, günde ~2-3 commit → 8-12 iş günü (test + polish hariç).

## Sonraki Faz Planlaması

Her faz tamamlandığında:
1. Commit atılır
2. `AGENTS.md` "Aşama Durumu" tablosu güncellenir
3. Bu `docs/PLAN.md` dosyasında ilgili faz durumu güncellenir (`🟡 devam ediyor` → `✅ tamamlandı`)
4. Kullanıcıya demo edilir, sonraki faz için onay alınır
