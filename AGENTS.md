# DijiCatalog — Agent Talimatları

Bu dosya, DijiCatalog projesi üzerinde çalışan AI agent'lar (Mavis dahil) için proje-spesifik kuralları içerir. Genel agent kurallarına ek olarak okunmalıdır.

## Proje Kimliği

- **İsim:** DijiCatalog
- **Tip:** Multi-tenant SaaS (kiralanabilir dijital katalog)
- **Workspace:** `D:\DigiCatalog`
- **Stack:** Node 22 + Express + TypeScript (server) / React 18 + Vite + Tailwind (client) / PostgreSQL + Drizzle ORM
- **Deploy:** Railway

## Temel Kurallar

### 1. Mimari Kararlar

- **Server:** `src/app.ts` (Express factory) + `src/server.ts` (bootstrap) + `src/index.ts` (entry) ayrımı korunur. Route'lar `src/routes/<domain>.ts`, iş mantığı `src/services/<domain>.ts` içinde.
- **Client:** Lazy-load edilen sayfalar (`React.lazy`), `src/components` UI, `src/pages` route'lar, `src/lib/api.ts` axios instance.
- **DB:** Drizzle schema `src/db/schema/<table>.ts` olarak tek tek dosyalarda, `src/db/schema/index.ts` hepsini re-export eder. Migration'lar `drizzle/` klasöründe.
- **Multi-tenant:** Her domain tablosunda `tenant_id` kolonu zorunlu. Tenant izolasyonu middleware'de (server) uygulanır. Asla raw SQL ile tenant filtresi unutulmaz.

### 2. Commit Stratejisi (Kullanıcı Tercihi)

- **Conventional Commits** zorunlu: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`
- Her büyük aşama ayrı commit serisi. Commit mesajı kullanıcı tarafından yazılır, agent sadece öneri sunar (eğer istenirse).
- Commit mesajı gövdesi (body) şunları içerir:
  - Yapılan işin özeti
  - Değişen dosya sayısı / satır sayısı
  - Breaking change varsa `BREAKING CHANGE:` notu

### 3. Trash Pattern

- Silinen dosyalar `.trash-YYYY-MM-DD/` klasörüne taşınır, asla `rm` ile kalıcı silme yapılmaz (kullanıcı tercihi).
- Klasör `.gitignore`'da pattern'li: `.trash*/` ve `.trash-*/`.
- Faz 0'da bu klasör oluşturulmaz, sadece gitignore kalıbı kurulur.

### 4. DB'siz Yaklaşım

- Kullanıcı test ortamı yoksa kod yazılır, çalıştırma sonraya bırakılır. Schema ve migration dosyaları yine de üretilir, push/migrate kullanıcının DB'si hazır olunca çalıştırılır.

### 5. Konfigürasyon

- Tüm env'ler `src/config/env.ts` (server) veya `import.meta.env` (client) üzerinden okunur, asla process.env direkt kullanılmaz.
- Yeni env eklendiğinde `.env.example` mutlaka güncellenir.

### 6. Test

- Her domain route'un en az 1 happy-path test'i (`vitest` + `supertest`).
- Client component'leri için React Testing Library (Vitest + jsdom).
- Test coverage hedefi: core domain logic %80+.

## Bilinen Tradeoff'lar

- **Row-level tenant isolation** seçildi (DB-per-tenant yerine). Tenant filtresi her query'de middleware ile uygulanır, unutulmaması için Drizzle helper'ları kullanılacak.
- **pdfkit** server-side PDF için seçildi (puppeteer yerine). Daha hafif, Railway'de Chromium gerektirmez. Dezavantaj: layout daha manuel, ama katalog şablonu için yeterli.
- **base64 resim** DB'de tutulacak (kullanıcı gereksinimi). 10MB'a kadar optimize edilecek (sıkıştırma sonrası). İleride S3/Cloudinary'ye geçiş adapter pattern ile mümkün.

## Sık Yapılan Hatalar

- ❌ Raw SQL yazarken `tenant_id` filtresi unutmak → her query helper üzerinden
- ❌ Client'ta `process.env` kullanmak → `import.meta.env.VITE_*` kullan
- ❌ Server'da `import.meta.env` → `process.env` (ve zod-validated wrapper)
- ❌ Multi-tenant olmayan testlerde gerçek tenant_id kullanmak → test'te ayrı test tenant'ı

## Aşama Durumu

| Faz | Konu | Durum |
|---|---|---|
| 0 | Altyapı (monorepo, server, client) | ✅ tamamlandı (commit ccc7b2e + 337708f) |
| 1 | Auth & multi-tenant | ✅ tamamlandı (commit a1822a7 + 65b83c0 + 94d6a13) |
| 2 | Ürün yönetimi | ✅ tamamlandı (commit a65608f + 91c0399 + 839eccc + 56a24e5) |
| 3 | Müşteri yönetimi | ✅ tamamlandı (commit c264488 + aa84442) |
| 4 | ERP entegrasyonu | ✅ tamamlandı (commit ef3c7b8 + d5f6494) |
| 5 | Katalog motoru | ✅ tamamlandı (commit 9888ce6 + 0002b2e + c07e941) |
| 6 | Ürün tanıtım ekranı + modal | ✅ tamamlandı (commit cdc79ad + bb064bd) |
| 7 | PDF üretimi | ⏳ |
| 8 | Polish & Railway deploy | ✅ tamamlandı (commit 1f44343 + commit 8.2) |
