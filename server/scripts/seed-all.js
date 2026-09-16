#!/usr/bin/env node
/**
 * DijiCatalog seed (mssql.node, raw INSERT + bcrypt password).
 *
 * sqlcmd ODBC sa login failed aliyor; apply-migration.js ve reset-password.js
 * mssql.node ile basarili. Bu script ayni config'i kullanarak demo veri
 * ekler (tenant + admin user + 3 kategori + 8 urun + 3 musteri + 1 katalog).
 *
 * Idempotent: IF NOT EXISTS kontrolleri ile tekrar calistirilabilir.
 *
 * Kullanim:
 *   node scripts/seed-all.js --server localhost --instance ABKA \
 *     --user sa --password 'dgfceu' --database DijiCatalog
 */
const bcrypt = require('bcryptjs');
const sql = require('mssql');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v && !v.startsWith('--')) { args[k] = v; i++; }
      else args[k] = true;
    }
  }
  return args;
}

const DEMO_TENANT = { name: 'Demo Katalog A.S.', slug: 'demo' };
const DEMO_USER = {
  email: 'demo@digicatalog.local',
  password: 'Demo123!',
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

const CATALOG_FIELD_NAMES = ['sku','name','description','price','currency','category','brand','unit','notes','images'];

async function main() {
  const args = parseArgs();
  const server = args.server || 'localhost';
  const port = args.port ? parseInt(args.port, 10) : null;
  const instance = args.instance;
  const user = args.user || 'sa';
  const password = args.password;
  const database = args.database || 'DijiCatalog';
  if (!password) { console.error('--password zorunlu'); process.exit(1); }

  const config = {
    user, password, server,
    ...(port ? { port } : {}),
    database,
    options: {
      encrypt: false, trustServerCertificate: true, enableArithAbort: true,
      ...(instance ? { instanceName: instance } : {}),
    },
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
  };

  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  console.log('[seed] Baglanti kuruldu');

  // === Tenant ===
  const tenantR = await pool.request()
    .input('slug', sql.NVarChar, DEMO_TENANT.slug)
    .query(`SELECT id FROM tenants WHERE slug = @slug`);
  let tenantId;
  if (tenantR.recordset[0]) {
    tenantId = tenantR.recordset[0].id;
    console.log(`[seed] Tenant zaten var: ${DEMO_TENANT.slug}`);
  } else {
    const r = await pool.request()
      .input('name', sql.NVarChar, DEMO_TENANT.name)
      .input('slug', sql.NVarChar, DEMO_TENANT.slug)
      .query(`INSERT INTO tenants (name, slug) OUTPUT INSERTED.id VALUES (@name, @slug)`);
    tenantId = r.recordset[0].id;
    console.log(`[seed] Tenant olusturuldu: ${DEMO_TENANT.slug} -> ${tenantId}`);
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
    console.log(`[seed] Admin user olusturuldu: ${DEMO_USER.email}`);
  } else {
    // Sifre reset
    const passwordHash = await bcrypt.hash(DEMO_USER.password, 10);
    await pool.request()
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('email', sql.NVarChar, DEMO_USER.email)
      .query(`UPDATE users SET password_hash = @passwordHash WHERE email = @email`);
    console.log(`[seed] User zaten var, sifre resetlendi: ${DEMO_USER.email}`);
  }

  // === Categories ===
  const categoryMap = new Map();
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
  console.log(`[seed] ${categoryMap.size} kategori hazir`);

  // === Products ===
  for (const p of DEMO_PRODUCTS) {
    const existsR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('sku', sql.NVarChar, p.sku)
      .query(`SELECT id FROM products WHERE tenant_id = @tenantId AND sku = @sku`);
    if (existsR.recordset[0]) continue;
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
  console.log(`[seed] ${DEMO_PRODUCTS.length} urun islendi`);

  // === Customers ===
  for (const c of DEMO_CUSTOMERS) {
    const existsR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('name', sql.NVarChar, c.name)
      .query(`SELECT id FROM customers WHERE tenant_id = @tenantId AND name = @name`);
    if (existsR.recordset[0]) continue;
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
  console.log(`[seed] ${DEMO_CUSTOMERS.length} musteri islendi`);

  // === Sample catalog ===
  const catalogR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT id FROM catalogs WHERE tenant_id = @tenantId`);
  if (!catalogR.recordset[0]) {
    const cR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('name', sql.NVarChar, 'Demo Ilkbahar Katalogu')
      .input('description', sql.NVarChar, 'Demo amacli ornek katalog.')
      .query(`INSERT INTO catalogs (tenant_id, name, description, status) OUTPUT INSERTED.id VALUES (@tenantId, @name, @description, 'active')`);
    const catalogId = cR.recordset[0].id;

    // Items
    const productsR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT id FROM products WHERE tenant_id = @tenantId ORDER BY name`);
    for (let i = 0; i < productsR.recordset.length; i++) {
      await pool.request()
        .input('catalogId', sql.UniqueIdentifier, catalogId)
        .input('productId', sql.UniqueIdentifier, productsR.recordset[i].id)
        .input('sortOrder', sql.Int, i)
        .query(`INSERT INTO catalog_items (catalog_id, product_id, sort_order) VALUES (@catalogId, @productId, @sortOrder)`);
    }
    // Customers
    const customersR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query(`SELECT id FROM customers WHERE tenant_id = @tenantId`);
    for (const c of customersR.recordset) {
      await pool.request()
        .input('catalogId', sql.UniqueIdentifier, catalogId)
        .input('customerId', sql.UniqueIdentifier, c.id)
        .query(`INSERT INTO catalog_customers (catalog_id, customer_id) VALUES (@catalogId, @customerId)`);
    }
    // Field config
    for (let i = 0; i < CATALOG_FIELD_NAMES.length; i++) {
      await pool.request()
        .input('catalogId', sql.UniqueIdentifier, catalogId)
        .input('fieldName', sql.NVarChar, CATALOG_FIELD_NAMES[i])
        .input('sortOrder', sql.Int, i)
        .query(`INSERT INTO catalog_field_config (catalog_id, field_name, is_visible, sort_order) VALUES (@catalogId, @fieldName, 1, @sortOrder)`);
    }
    console.log(`[seed] Demo katalog olusturuldu (8 urun, 3 musteri, 10 alan)`);
  } else {
    console.log(`[seed] Catalog zaten var, atlandi`);
  }

  console.log('[seed] Tamamlandi.');
  console.log(`[seed] Giris: ${DEMO_USER.email} / ${DEMO_USER.password}`);

  await pool.close();
}

main().catch((e) => { console.error('Hata:', e.message); console.error(e); process.exit(1); });