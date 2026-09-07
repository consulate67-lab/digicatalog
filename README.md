# DijiCatalog

> Kiralanabilir dijital katalog SaaS — ürünlerinizi kategorilere göre kataloglayın, müşteri ziyaretlerinde gösterin, tek tuşla PDF olarak paylaşın.

## ✨ Özellikler

- 🏢 **Multi-tenant mimari** — her kiracı kendi verisinde izole
- 🔐 **JWT auth** — access (15dk) + refresh (7g) token, bcrypt password hashing
- 📦 **Ürün yönetimi** — manuel CRUD + Excel/Xml bulk import + base64 resimler (client-side Canvas resize)
- 👥 **Müşteri yönetimi** — manuel CRUD + Excel bulk import, vergi bilgileri (TR)
- 🔌 **ERP entegrasyonu** — Mock provider + **Korgün ERP (MSSQL)** adapter, otomatik senkronizasyon
- 📚 **Katalog motoru** — 4 adımlı wizard (bilgi/müşteri/ürün/alan), hızlı bant filtre (fiyat/kategori/marka)
- 👁️ **Public viewer** — auth gerektirmez, link-based, kategori sidebar + ürün grid + büyük resim modal
- 📄 **PDF export** — server-side pdfkit, kapak/içindekiler/kategori sayfaları, custom override'lar
- 🛡️ **Security** — helmet, CORS whitelist, rate limit (brute-force koruması), trust proxy

## 🏗 Mimari

```
D:\DigiCatalog\                ← npm workspaces monorepo
├── server/                     ← Node 22 + Express + TypeScript
│   ├── src/
│   │   ├── config/             ← env (zod) + database (pg + drizzle)
│   │   ├── db/schema/          ← Drizzle şemaları (10 tablo, 4 enum)
│   │   ├── integrations/erp/   ← BaseErpAdapter + Mock + KorgunMssql
│   │   ├── middleware/         ← auth (JWT), tenant (withTenant helper), errorHandler
│   │   ├── routes/             ← 12 route modülü
│   │   ├── services/           ← İş mantığı (12 service)
│   │   └── utils/              ← logger (pino)
│   ├── scripts/                ← seed-demo.ts
│   └── drizzle.config.ts
│
├── client/                     ← React 18 + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/         ← AdminLayout, AdminSidebar, ImageUploader
│   │   ├── lib/                ← api (axios), auth (Zustand), ProtectedRoute, pdfDownload
│   │   ├── pages/              ← 28 sayfa (admin + viewer)
│   │   └── store/              ← auth.ts (Zustand persist)
│   └── vite.config.ts
│
├── docs/PLAN.md                ← 8 aşama geliştirme planı
└── AGENTS.md                   ← proje-spesifik agent talimatları
```

## 🚀 Hızlı Başlangıç (Local Development)

### 1) PostgreSQL

```bash
docker run -d --name digicatalog-pg \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=digicatalog \
  -p 5432:5432 postgres:15
```

### 2) Repo kurulumu

```bash
git clone <repo>
cd D:\DigiCatalog
npm install
```

### 3) Env dosyaları

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env` içinde `DATABASE_URL`'i ayarla:

```env
DATABASE_URL=postgresql://postgres:devpass@localhost:5432/digicatalog
JWT_SECRET=dev-secret-en-az-32-karakter-uzunlugunda
ALLOWED_ORIGINS=http://localhost:5173
```

### 4) Migration + seed

```bash
cd server
npm run db:migrate
npm run db:seed      # demo tenant + ürün + müşteri + katalog
```

### 5) Dev sunucuları

```bash
# Terminal 1 — server (port 3000)
cd server
npm run dev

# Terminal 2 — client (port 5173)
cd client
npm run dev
```

Tarayıcıda: **http://localhost:5173**

**Demo giriş bilgileri** (seed sonrası):
- Email: `demo@digicatalog.local`
- Şifre: `Demo123!`

## ☁️ Production Deploy (Railway)

### 1) Railway'de proje oluştur

1. https://railway.app/new adresine git
2. **Deploy from GitHub repo** seç
3. Repository'yi bağla

### 2) PostgreSQL eklentisi

1. Proje paneline dön
2. **+ New** → **Database** → **PostgreSQL**
3. PostgreSQL servisi oluşur
4. **Variables** sekmesinden `DATABASE_URL`'i kopyala

### 3) Environment variables (Backend service)

| Key | Değer | Açıklama |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | Railway otomatik set eder, override edilebilir |
| `DATABASE_URL` | (PostgreSQL'den kopyala) | `postgresql://postgres:xxx@containers-us-west-xxx.railway.app:5432/railway` |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | 128 karakter hex |
| `ALLOWED_ORIGINS` | `https://<frontend>.up.railway.app` | Frontend URL (deploy sonrası güncelle) |
| `LOG_LEVEL` | `info` | `debug` yapılabilir development'ta |

### 4) Deploy ayarları

Repository **root**'unda (`D:\DigiCatalog\`) zaten `railway.toml` var. Railway otomatik algılar.

Manuel ayar gerekirse:
- **Build command:** `cd server && npm install && npm run build`
- **Start command:** `cd server && npm start`
- **Health check path:** `/api/ping`

### 5) İlk migration

Production'a deploy ettikten sonra, Railway shell'den (veya `railway run` lokal'den):

```bash
railway run npm run db:migrate
railway run npm run db:seed   # opsiyonel — demo veri
```

### 6) Frontend deploy (opsiyonel, ayrı service)

İki seçenek:
1. **Client'ı server'ın serve etmesi** (Faz 8'de basit express.static eklenmedi, ayrı service daha temiz)
2. **Ayrı Railway service** — Vite build → static files, public URL

Bu projede Faz 0'da sadece server service var, frontend ayrı deploy için `client/dist` build alıp herhangi bir static host'a (Vercel, Netlify, S3) yükleyebilirsiniz.

## 📚 Dokümantasyon

- `AGENTS.md` — proje-spesifik agent talimatları (mimari, commit stratejisi, trade-off'lar)
- `docs/PLAN.md` — 8 aşama geliştirme planı + commit listesi + her fazın doğrulamaları

## 🧪 Test Akışı (Local)

1. http://localhost:5173/register → yeni tenant oluştur
2. /admin/products → ürün ekle + resim yükle (Canvas resize)
3. /admin/products/import → Excel/Xml bulk import
4. /admin/customers → müşteri ekle
5. /admin/integrations → ERP provider seç (mock veya korgun-mssql), test et, sync
6. /admin/catalogs/new → 4 adımlı wizard (katalog oluştur)
7. /admin/catalogs listesinde "PDF İndir" → PDF indir
8. Katalogu "Aktif" yap → Viewer linki (göz ikonu) → public viewer açılır
9. Müşteri ziyaret simülasyonu: viewer'da ürün tıkla → modal açılır

## 🛠 Tech Stack

**Backend:** Node 22, Express 4.21, TypeScript 5.7, Drizzle ORM 0.45, PostgreSQL 15+, JWT (jsonwebtoken 9), bcryptjs 2.4, Zod 3.24, Pino 9, Helmet 8, express-rate-limit 7, pdfkit 0.15, mssql 11 (Korgün), multer 1.4, xlsx 0.18, fast-xml-parser 4.5

**Frontend:** React 18.3, Vite 5.4, TypeScript 5.7, Tailwind 3.4, React Router 6.28, TanStack Query 5.62, Zustand 5.0, Axios 1.7, Lucide React 0.469

## 📊 İstatistikler

- **23 commit** (Faz 0-8, 8 aşama)
- **10 DB tablosu** + 4 enum + 4 migration
- **~60+ API endpoint** (12 route modülü)
- **28 client sayfa** (lazy-load admin + viewer)
- **~10K+ satır TypeScript**
- **Ana bundle:** 296 KB JS (gzip 95 KB), lazy chunks 5-16 KB

## 📄 Lisans

Proprietary — © 2026 DijiCatalog. Tüm hakları saklıdır.
