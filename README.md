# DijiCatalog

> Kiralanabilir dijital katalog SaaS — ürünlerinizi kategorilere göre kataloglayın, müşteri ziyaretlerinde gösterin, PDF olarak paylaşın.

## Vizyon

ERP'den ürün/müşteri verisini çekip "hızlı bant" filtre sistemi ile müşteriye özel görsel kataloglar oluşturun. Müşteri ziyaretinde ürün kartlarından tıklayarak detay modal açın, tek tuşla PDF çıktısı alın.

## Mimari

```
D:\DigiCatalog\                ← npm workspaces monorepo
├── server/                     ← Node 22 + Express + TypeScript
│   ├── src/
│   │   ├── config/             ← env (zod) + database (pg + drizzle)
│   │   ├── db/schema/          ← Drizzle şemaları (Faz 1'den itibaren)
│   │   ├── middleware/         ← auth, errorHandler, tenant
│   │   ├── routes/             ← domain route'lar
│   │   ├── services/           ← iş mantığı
│   │   └── utils/              ← logger, helpers
│   └── drizzle.config.ts
│
├── client/                     ← React 18 + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/         ← UI bileşenleri
│   │   ├── pages/              ← route sayfaları
│   │   ├── lib/                ← api client, hooks
│   │   └── store/              ← zustand state
│   └── vite.config.ts
│
└── docs/PLAN.md                ← 8 aşama geliştirme planı
```

**Stack:** Node 22, Express 4, TypeScript 5, PostgreSQL 15+, Drizzle ORM 0.36, React 18, Vite 5, Tailwind 3, React Router 6, Zustand 4, TanStack Query 5, Zod 3, Pino 9, pdfkit (server-side PDF), SheetJS (Excel), fast-xml-parser (XML).

## Hızlı Başlangıç

```bash
# 1) Bağımlılıkları kur (root + workspaces)
npm install

# 2) Server env
cp server/.env.example server/.env
# server/.env içinde DATABASE_URL'i ayarla

# 3) Client env
cp client/.env.example client/.env

# 4) Development (her iki servis paralel)
npm run dev
# → Server: http://localhost:3000  (health: /api/ping)
# → Client: http://localhost:5173  (Vite dev server)

# 5) Production build
npm run build
```

## Geliştirme Komutları

| Komut | Açıklama |
|---|---|
| `npm run dev` | Server (3000) + Client (5173) paralel başlat |
| `npm run server:dev` | Sadece server |
| `npm run client:dev` | Sadece client |
| `npm run build` | Server (tsc) + Client (vite build) |
| `npm start` | Production server (built output) |
| `npm run db:generate` | Drizzle schema'dan SQL migration üret |
| `npm run db:push` | Schema'yı doğrudan DB'ye uygula (dev) |
| `npm run db:migrate` | Migration'ları çalıştır |
| `npm run db:studio` | Drizzle Studio (DB GUI) |
| `npm test` | Tüm workspace testleri |

## Veritabanı (PostgreSQL)

Production için Railway'de PostgreSQL eklentisi kullanılacak. Local development için:

```bash
# Docker ile hızlı PostgreSQL
docker run --name digicatalog-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=digicatalog -p 5432:5432 -d postgres:15

# veya mevcut bir instance'a bağlan
DATABASE_URL=postgresql://user:pass@localhost:5432/digicatalog
```

## Deployment (Railway)

1. Railway'de yeni proje oluştur
2. PostgreSQL eklentisi ekle
3. GitHub repo'yu bağla (root = `D:\DigiCatalog`)
4. Environment variables:
   - `NODE_ENV=production`
   - `DATABASE_URL` ← Railway PostgreSQL'den otomatik
   - `JWT_SECRET` ← güçlü rastgele (64+ char)
   - `ALLOWED_ORIGINS` ← frontend origin (Faz 8'de)
5. Deploy otomatik tetiklenir

## Geliştirme Yol Haritası

8 aşamadan oluşan plan: `docs/PLAN.md` dosyasına bakın.

- **Faz 0** — Altyapı ✅
- **Faz 1** — Auth & Multi-tenant
- **Faz 2** — Ürün yönetimi (manuel + Excel/XML)
- **Faz 3** — Müşteri yönetimi
- **Faz 4** — ERP entegrasyonu
- **Faz 5** — Katalog motoru
- **Faz 6** — Ürün tanıtım ekranı + modal
- **Faz 7** — PDF üretimi
- **Faz 8** — Polish & deploy

## Lisans

Proprietary — © 2026 DijiCatalog. Tüm hakları saklıdır.
