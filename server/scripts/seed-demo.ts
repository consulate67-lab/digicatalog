/**
 * Demo seed script.
 *
 * Calistirma: npx tsx server/scripts/seed-demo.ts
 *
 * Olusturur:
 * - Demo tenant ("Demo Katalog A.S.")
 * - Admin user (demo@digicatalog.local / Demo123!)
 * - 3 kategori (Elektronik, Mobilya, Ofis)
 * - 8 urun (farkli kategorilerde)
 * - 3 musteri
 * - 1 aktif katalog (Demo Katalog) — urunlerin cogunu icerir
 *
 * Notlar:
 * - Idempotent: tenant slug varsa skip eder
 * - Urun resimleri placeholder (gercek base64 eklemek icin
 *   urun detay sayfasindan yukleyin)
 * - Production'da calistirmadan once DEMO_TENANT_EMAIL env
 *   ile override edin
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { logger } from '../src/utils/logger';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL tanımlı değil');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

const DEMO_TENANT = {
  name: 'Demo Katalog A.Ş.',
  slug: 'demo',
};
const DEMO_USER = {
  email: process.env.DEMO_TENANT_EMAIL ?? 'demo@digicatalog.local',
  password: process.env.DEMO_TENANT_PASSWORD ?? 'Demo123!',
  name: 'Demo Admin',
};
const DEMO_CATEGORIES = [
  { name: 'Elektronik', slug: 'elektronik' },
  { name: 'Mobilya', slug: 'mobilya' },
  { name: 'Ofis', slug: 'ofis' },
];

const DEMO_PRODUCTS = [
  {
    sku: 'LAP-DEMO-01',
    name: 'Demo Laptop 14"',
    description: '14 inç ekran, 16GB RAM, 512GB SSD. Demo amaçlıdır.',
    price: '24999.00',
    categorySlug: 'elektronik',
    brand: 'DemoBrand',
    unit: 'adet',
  },
  {
    sku: 'TEL-DEMO-01',
    name: 'Demo Akıllı Telefon 128GB',
    description: '6.5 inç ekran, 128GB depolama. Demo amaçlıdır.',
    price: '18999.00',
    categorySlug: 'elektronik',
    brand: 'DemoMobile',
    unit: 'adet',
  },
  {
    sku: 'KUL-DEMO-01',
    name: 'Demo Kablosuz Kulaklık',
    description: 'Bluetooth, gürültü engelleme. Demo amaçlıdır.',
    price: '2499.00',
    categorySlug: 'elektronik',
    brand: 'DemoSound',
    unit: 'adet',
  },
  {
    sku: 'MZD-DEMO-01',
    name: 'Demo Çalışma Masası',
    description: '120x60cm, meşe kaplama. Demo amaçlıdır.',
    price: '5999.00',
    categorySlug: 'mobilya',
    brand: 'DemoWood',
    unit: 'adet',
  },
  {
    sku: 'SNK-DEMO-01',
    name: 'Demo Ofis Sandalyesi',
    description: 'Ergonomik, ayarlanabilir yükseklik. Demo amaçlıdır.',
    price: '3499.00',
    categorySlug: 'mobilya',
    brand: 'DemoComfort',
    unit: 'adet',
  },
  {
    sku: 'DLR-DEMO-01',
    name: 'Demo Dosya Dolabı',
    description: '4 çekmeceli, metal. Demo amaçlıdır.',
    price: '2299.00',
    categorySlug: 'mobilya',
    brand: 'DemoOffice',
    unit: 'adet',
  },
  {
    sku: 'YK-DEMO-01',
    name: 'Demo Yazıcı',
    description: 'Renkli lazer, A4. Demo amaçlıdır.',
    price: '4999.00',
    categorySlug: 'ofis',
    brand: 'DemoPrint',
    unit: 'adet',
  },
  {
    sku: 'KLT-DEMO-01',
    name: 'Demo Monitör 27"',
    description: '4K IPS, HDMI+DP. Demo amaçlıdır.',
    price: '7999.00',
    categorySlug: 'elektronik',
    brand: 'DemoDisplay',
    unit: 'adet',
  },
];

const DEMO_CUSTOMERS = [
  {
    name: 'Acme Tekstil Ltd.',
    contactName: 'Mehmet Yılmaz',
    email: 'info@acme-demo.com',
    phone: '+90 212 555 0001',
    taxNumber: '1111111111',
    taxOffice: 'Beşiktaş',
  },
  {
    name: 'Beta Mühendislik A.Ş.',
    contactName: 'Ayşe Kaya',
    email: 'ayse@beta-demo.com',
    phone: '+90 532 111 0002',
    taxNumber: '2222222222',
    taxOffice: 'Çankaya',
  },
  {
    name: 'Gamma Ltd. Şti.',
    contactName: 'Ali Demir',
    phone: '+90 555 999 0003',
    address: 'Demo Adres 3, İzmir',
  },
];

const main = async (): Promise<void> => {
  logger.info('🌱 Demo seed başlıyor...');

  // === Tenant ===
  const [existingTenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, DEMO_TENANT.slug))
    .limit(1);

  let tenantId: string;
  if (existingTenant) {
    logger.info({ tenant: existingTenant.slug }, 'Tenant zaten var, atlanıyor');
    tenantId = existingTenant.id;
  } else {
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: DEMO_TENANT.name, slug: DEMO_TENANT.slug })
      .returning();
    tenantId = tenant.id;
    logger.info({ tenantId, slug: tenant.slug }, '✅ Tenant oluşturuldu');
  }

  // === Admin user ===
  const [existingUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_USER.email))
    .limit(1);

  if (!existingUser) {
    const passwordHash = await bcrypt.hash(DEMO_USER.password, 10);
    await db.insert(schema.users).values({
      tenantId,
      email: DEMO_USER.email,
      passwordHash,
      name: DEMO_USER.name,
      role: 'admin',
    });
    logger.info({ email: DEMO_USER.email }, '✅ Admin user oluşturuldu');
  } else {
    logger.info({ email: DEMO_USER.email }, 'User zaten var, atlanıyor');
  }

  // === Categories ===
  const categoryMap = new Map<string, string>();
  const existingCats = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.tenantId, tenantId));
  for (const c of existingCats) categoryMap.set(c.slug, c.id);
  for (const c of DEMO_CATEGORIES) {
    if (categoryMap.has(c.slug)) continue;
    const [created] = await db
      .insert(schema.categories)
      .values({ tenantId, name: c.name, slug: c.slug })
      .returning();
    categoryMap.set(c.slug, created.id);
  }
  logger.info({ count: categoryMap.size }, '✅ Kategoriler hazır');

  // === Products ===
  const existingProducts = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.tenantId, tenantId));
  if (existingProducts.length === 0) {
    for (const p of DEMO_PRODUCTS) {
      await db.insert(schema.products).values({
        tenantId,
        sku: p.sku,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: 'TRY',
        categoryId: categoryMap.get(p.categorySlug) ?? null,
        brand: p.brand,
        unit: p.unit,
        isActive: true,
      });
    }
    logger.info({ count: DEMO_PRODUCTS.length }, '✅ Ürünler oluşturuldu');
  } else {
    logger.info({ count: existingProducts.length }, 'Ürünler zaten var, atlanıyor');
  }

  // === Customers ===
  const existingCustomers = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.tenantId, tenantId));
  if (existingCustomers.length === 0) {
    for (const c of DEMO_CUSTOMERS) {
      await db.insert(schema.customers).values({ tenantId, ...c, isActive: true });
    }
    logger.info({ count: DEMO_CUSTOMERS.length }, '✅ Müşteriler oluşturuldu');
  } else {
    logger.info({ count: existingCustomers.length }, 'Müşteriler zaten var, atlanıyor');
  }

  // === Sample catalog ===
  const [existingCatalog] = await db
    .select()
    .from(schema.catalogs)
    .where(eq(schema.catalogs.tenantId, tenantId))
    .limit(1);
  if (!existingCatalog) {
    const allProducts = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.tenantId, tenantId));
    const allCustomers = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.tenantId, tenantId));

    const [catalog] = await db
      .insert(schema.catalogs)
      .values({
        tenantId,
        name: 'Demo İlkbahar Kataloğu',
        description: 'Demo amaçlı oluşturulmuş örnek katalog. Müşteri ziyaretinde açıp gösterebilirsiniz.',
        status: 'active',
      })
      .returning();

    // Tüm ürünleri ekle
    for (let i = 0; i < allProducts.length; i++) {
      await db.insert(schema.catalogItems).values({
        catalogId: catalog.id,
        productId: allProducts[i].id,
        sortOrder: i,
      });
    }
    // Tüm müşterileri ata
    for (const c of allCustomers) {
      await db.insert(schema.catalogCustomers).values({
        catalogId: catalog.id,
        customerId: c.id,
      });
    }
    // Default field config
    for (let i = 0; i < schema.CATALOG_FIELD_NAMES.length; i++) {
      await db.insert(schema.catalogFieldConfig).values({
        catalogId: catalog.id,
        fieldName: schema.CATALOG_FIELD_NAMES[i],
        isVisible: true,
        sortOrder: i,
      });
    }

    logger.info(
      { catalogId: catalog.id, products: allProducts.length, customers: allCustomers.length },
      '✅ Demo katalog oluşturuldu (active)',
    );
  }

  logger.info('🎉 Demo seed tamamlandı!');
  logger.info(
    { email: DEMO_USER.email, password: DEMO_USER.password },
    'Giriş bilgileri',
  );

  await pool.end();
};

main().catch((err) => {
  console.error('❌ Seed hatası:', err);
  pool.end();
  process.exit(1);
});
