/**
 * Demo seed script (raw mssql).
 *
 * Calistirma: npx tsx server/scripts/seed-demo.ts
 *
 * Olusturur:
 * - Demo tenant ("Demo Katalog A.S.")
 * - Admin user (demo@digicatalog.local / Demo123!)
 * - 3 kategori
 * - 8 urun
 * - 3 musteri
 * - 1 aktif katalog (Demo Ilkbahar Kataloğu)
 *
 * Idempotent: tenant slug varsa skip eder.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { parseDatabaseUrl } from '../src/config/database';
import { logger } from '../src/utils/logger';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL tanimli degil');
  process.exit(1);
}

const cfg = parseDatabaseUrl(DATABASE_URL);
const pool = new sql.ConnectionPool({
  user: cfg.user,
  password: cfg.password,
  server: cfg.server,
  ...(cfg.port !== null ? { port: cfg.port } : {}),
  database: cfg.database,
  options: {
    encrypt: cfg.encrypt,
    trustServerCertificate: cfg.trustServerCertificate,
    enableArithAbort: true,
  },
  connectionTimeout: 15_000,
  requestTimeout: 60_000,
  pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
});

const CATALOG_FIELD_NAMES = [
  'sku', 'name', 'description', 'price', 'currency',
  'category', 'brand', 'unit', 'notes', 'images',
] as const;

const DEMO_TENANT = { name: 'Demo Katalog A.S.', slug: 'demo' };
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
  { sku: 'LAP-DEMO-01', name: 'Demo Laptop 14"', description: '14 inc ekran, 16GB RAM, 512GB SSD. Demo amaclidir.', price: 24999.00, categorySlug: 'elektronik', brand: 'DemoBrand', unit: 'adet' },
  { sku: 'TEL-DEMO-01', name: 'Demo Akilli Telefon 128GB', description: '6.5 inc ekran, 128GB depolama. Demo amaclidir.', price: 18999.00, categorySlug: 'elektronik', brand: 'DemoMobile', unit: 'adet' },
  { sku: 'KUL-DEMO-01', name: 'Demo Kablosuz Kulaklik', description: 'Bluetooth, gurultu engelleme. Demo amaclidir.', price: 2499.00, categorySlug: 'elektronik', brand: 'DemoSound', unit: 'adet' },
  { sku: 'MZD-DEMO-01', name: 'Demo Calisma Masasi', description: '120x60cm, mese kaplama. Demo amaclidir.', price: 5999.00, categorySlug: 'mobilya', brand: 'DemoWood', unit: 'adet' },
  { sku: 'SNK-DEMO-01', name: 'Demo Ofis Sandalyesi', description: 'Ergonomik, ayarlanabilir yukseklik. Demo amaclidir.', price: 3499.00, categorySlug: 'mobilya', brand: 'DemoComfort', unit: 'adet' },
  { sku: 'DLR-DEMO-01', name: 'Demo Dosya Dolabi', description: '4 cekmeceli, metal. Demo amaclidir.', price: 2299.00, categorySlug: 'mobilya', brand: 'DemoOffice', unit: 'adet' },
  { sku: 'YK-DEMO-01', name: 'Demo Yazici', description: 'Renkli lazer, A4. Demo amaclidir.', price: 4999.00, categorySlug: 'ofis', brand: 'DemoPrint', unit: 'adet' },
  { sku: 'KLT-DEMO-01', name: 'Demo Monitor 27"', description: '4K IPS, HDMI+DP. Demo amaclidir.', price: 7999.00, categorySlug: 'elektronik', brand: 'DemoDisplay', unit: 'adet' },
];

const DEMO_CUSTOMERS = [
  { name: 'Acme Tekstil Ltd.', contactName: 'Mehmet Yilmaz', email: 'info@acme-demo.com', phone: '+90 212 555 0001', taxNumber: '1111111111', taxOffice: 'Besiktas' },
  { name: 'Beta Muhendislik A.S.', contactName: 'Ayse Kaya', email: 'ayse@beta-demo.com', phone: '+90 532 111 0002', taxNumber: '2222222222', taxOffice: 'Cankaya' },
  { name: 'Gamma Ltd. Sti.', contactName: 'Ali Demir', phone: '+90 555 999 0003', address: 'Demo Adres 3, Izmir' },
];

const main = async (): Promise<void> => {
  logger.info('Demo seed basliyor...');
  await pool.connect();

  // === Tenant ===
  const tenantR = await pool.request()
    .input('slug', sql.NVarChar, DEMO_TENANT.slug)
    .query(`SELECT id FROM tenants WHERE slug = @slug`);
  let tenantId: string;
  if (tenantR.recordset[0]) {
    tenantId = tenantR.recordset[0].id;
    logger.info({ tenant: DEMO_TENANT.slug }, 'Tenant zaten var, atlanıyor');
  } else {
    const r = await pool.request()
      .input('name', sql.NVarChar, DEMO_TENANT.name)
      .input('slug', sql.NVarChar, DEMO_TENANT.slug)
      .query(`INSERT INTO tenants (name, slug) OUTPUT INSERTED.id VALUES (@name, @slug)`);
    tenantId = r.recordset[0].id;
    logger.info({ tenantId, slug: DEMO_TENANT.slug }, 'Tenant olusturuldu');
  }

  // === Admin user ===
  const userR = await pool.request()
    .input('email', sql.NVarChar, DEMO_USER.email)
    .query(`SELECT id FROM users WHERE email = @email`);
  if (!userR.recordset[0]) {
    const passwordHash = await bcrypt.hash(DEMO_USER.password, 10);
    await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('email', sql.NVarChar, DEMO_USER.email)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('name', sql.NVarChar, DEMO_USER.name)
      .query(`INSERT INTO users (tenant_id, email, password_hash, name, role)
              VALUES (@tenantId, @email, @passwordHash, @name, 'admin')`);
    logger.info({ email: DEMO_USER.email }, 'Admin user olusturuldu');
  } else {
    logger.info({ email: DEMO_USER.email }, 'User zaten var, atlanıyor');
  }

  // === Categories ===
  const categoryMap = new Map<string, string>();
  const catR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT id, slug FROM categories WHERE tenant_id = @tenantId`);
  for (const c of catR.recordset) categoryMap.set(c.slug, c.id);

  for (const c of DEMO_CATEGORIES) {
    if (categoryMap.has(c.slug)) continue;
    const r = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('name', sql.NVarChar, c.name)
      .input('slug', sql.NVarChar, c.slug)
      .query(`INSERT INTO categories (tenant_id, name, slug) OUTPUT INSERTED.id VALUES (@tenantId, @name, @slug)`);
    categoryMap.set(c.slug, r.recordset[0].id);
  }
  logger.info({ count: categoryMap.size }, 'Kategoriler hazir');

  // === Products ===
  const prodR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT COUNT(*) AS c FROM products WHERE tenant_id = @tenantId`);
  const existingProdCount = prodR.recordset[0].c;
  if (existingProdCount === 0) {
    for (const p of DEMO_PRODUCTS) {
      await pool.request()
        .input('tenantId', sql.UniqueIdentifier, tenantId)
        .input('sku', sql.NVarChar, p.sku)
        .input('name', sql.NVarChar, p.name)
        .input('description', sql.NVarChar, p.description)
        .input('price', sql.Decimal(12, 2), String(p.price))
        .input('currency', sql.NVarChar, 'TRY')
        .input('categoryId', sql.UniqueIdentifier, categoryMap.get(p.categorySlug) ?? null)
        .input('brand', sql.NVarChar, p.brand)
        .input('unit', sql.NVarChar, p.unit)
        .query(`INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
                VALUES (@tenantId, @sku, @name, @description, @price, @currency, @categoryId, @brand, @unit, 1)`);
    }
    logger.info({ count: DEMO_PRODUCTS.length }, 'Urunler olusturuldu');
  } else {
    logger.info({ count: existingProdCount }, 'Urunler zaten var, atlanıyor');
  }

  // === Customers ===
  const custR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT COUNT(*) AS c FROM customers WHERE tenant_id = @tenantId`);
  const existingCustCount = custR.recordset[0].c;
  if (existingCustCount === 0) {
    for (const c of DEMO_CUSTOMERS) {
      await pool.request()
        .input('tenantId', sql.UniqueIdentifier, tenantId)
        .input('name', sql.NVarChar, c.name)
        .input('contactName', sql.NVarChar, c.contactName ?? null)
        .input('email', sql.NVarChar, c.email ?? null)
        .input('phone', sql.NVarChar, c.phone ?? null)
        .input('address', sql.NVarChar, c.address ?? null)
        .input('taxNumber', sql.NVarChar, c.taxNumber ?? null)
        .input('taxOffice', sql.NVarChar, c.taxOffice ?? null)
        .query(`INSERT INTO customers (tenant_id, name, contact_name, email, phone, address, tax_number, tax_office, is_active)
                VALUES (@tenantId, @name, @contactName, @email, @phone, @address, @taxNumber, @taxOffice, 1)`);
    }
    logger.info({ count: DEMO_CUSTOMERS.length }, 'Musteriler olusturuldu');
  } else {
    logger.info({ count: existingCustCount }, 'Musteriler zaten var, atlanıyor');
  }

  // === Sample catalog ===
  const catalogR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT id FROM catalogs WHERE tenant_id = @tenantId`);
  if (!catalogR.recordset[0]) {
    const productsR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT id FROM products WHERE tenant_id = @tenantId ORDER BY name`);
    const customersR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT id FROM customers WHERE tenant_id = @tenantId`);

    const cR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('name', sql.NVarChar, 'Demo Ilkbahar Kataloğu')
      .input('description', sql.NVarChar, 'Demo amacli olusturulmus ornek katalog. Musteri ziyaretinde acip gosterebilirsiniz.')
      .query(`INSERT INTO catalogs (tenant_id, name, description, status)
              OUTPUT INSERTED.id VALUES (@tenantId, @name, @description, 'active')`);
    const catalogId = cR.recordset[0].id;

    for (let i = 0; i < productsR.recordset.length; i++) {
      await pool.request()
        .input('catalogId', sql.UniqueIdentifier, catalogId)
        .input('productId', sql.UniqueIdentifier, productsR.recordset[i].id)
        .input('sortOrder', sql.Int, i)
        .query(`INSERT INTO catalog_items (catalog_id, product_id, sort_order)
                VALUES (@catalogId, @productId, @sortOrder)`);
    }
    for (const c of customersR.recordset) {
      await pool.request()
        .input('catalogId', sql.UniqueIdentifier, catalogId)
        .input('customerId', sql.UniqueIdentifier, c.id)
        .query(`INSERT INTO catalog_customers (catalog_id, customer_id)
                VALUES (@catalogId, @customerId)`);
    }
    for (let i = 0; i < CATALOG_FIELD_NAMES.length; i++) {
      await pool.request()
        .input('catalogId', sql.UniqueIdentifier, catalogId)
        .input('fieldName', sql.NVarChar, CATALOG_FIELD_NAMES[i])
        .input('sortOrder', sql.Int, i)
        .query(`INSERT INTO catalog_field_config (catalog_id, field_name, is_visible, sort_order)
                VALUES (@catalogId, @fieldName, 1, @sortOrder)`);
    }
    logger.info({ catalogId }, 'Demo katalog olusturuldu');
  } else {
    logger.info('Catalog zaten var, atlanıyor');
  }

  logger.info('Demo seed tamamlandi!');
  logger.info(
    { email: DEMO_USER.email, password: DEMO_USER.password },
    'Giris bilgileri',
  );

  await pool.close();
};

main().catch(async (err) => {
  console.error('Seed hatasi:', err);
  try { await pool.close(); } catch (_e) { /* ignore */ }
  process.exit(1);
});