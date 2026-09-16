-- DijiCatalog demo seed (raw SQL).
-- mssql node paketi ile ELOGIN sorunu olursa sqlcmd ile bu dosyayi calistirin.
-- apply-migration.js ile tablolar zaten olusturulmus olmali.

SET XACT_ABORT ON;
BEGIN TRAN;

DECLARE @demoTenantId UNIQUEIDENTIFIER = NEWID();
DECLARE @catElektronik UNIQUEIDENTIFIER = NEWID();
DECLARE @catMobilya UNIQUEIDENTIFIER = NEWID();
DECLARE @catOfis UNIQUEIDENTIFIER = NEWID();

-- Demo tenant (idempotent: slug 'demo' varsa atla)
IF NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'demo')
BEGIN
    INSERT INTO tenants (id, name, slug) VALUES (@demoTenantId, N'Demo Katalog A.S.', 'demo');
END
ELSE
BEGIN
    SELECT @demoTenantId = id FROM tenants WHERE slug = 'demo';
END

-- Admin user (idempotent: email varsa skip)
IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo@digicatalog.local')
BEGIN
    INSERT INTO users (tenant_id, email, password_hash, name, role)
    VALUES (@demoTenantId, N'demo@digicatalog.local', N'$2b$10$8XqaCEzKp5.KjZjlCN7H0Oe0LqgQHHN8iZy.Kd/vw.lO5m/Td1hpu', N'Demo Admin', 'admin');
END

-- Categories
IF NOT EXISTS (SELECT 1 FROM categories WHERE tenant_id = @demoTenantId AND slug = 'elektronik')
    INSERT INTO categories (id, tenant_id, name, slug) VALUES (@catElektronik, @demoTenantId, N'Elektronik', 'elektronik');
IF NOT EXISTS (SELECT 1 FROM categories WHERE tenant_id = @demoTenantId AND slug = 'mobilya')
    INSERT INTO categories (id, tenant_id, name, slug) VALUES (@catMobilya, @demoTenantId, N'Mobilya', 'mobilya');
IF NOT EXISTS (SELECT 1 FROM categories WHERE tenant_id = @demoTenantId AND slug = 'ofis')
    INSERT INTO categories (id, tenant_id, name, slug) VALUES (@catOfis, @demoTenantId, N'Ofis', 'ofis');

-- Products (idempotent: SKU + tenant)
IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = @demoTenantId AND sku = 'LAP-DEMO-01')
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
    VALUES (@demoTenantId, 'LAP-DEMO-01', N'Demo Laptop 14"', N'14 inc ekran, 16GB RAM, 512GB SSD. Demo amaclidir.', 24999.00, 'TRY', @catElektronik, N'DemoBrand', N'adet', 1);

IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = @demoTenantId AND sku = 'TEL-DEMO-01')
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
    VALUES (@demoTenantId, 'TEL-DEMO-01', N'Demo Akilli Telefon 128GB', N'6.5 inc ekran, 128GB depolama. Demo amaclidir.', 18999.00, 'TRY', @catElektronik, N'DemoMobile', N'adet', 1);

IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = @demoTenantId AND sku = 'KUL-DEMO-01')
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
    VALUES (@demoTenantId, 'KUL-DEMO-01', N'Demo Kablosuz Kulaklik', N'Bluetooth, gurultu engelleme. Demo amaclidir.', 2499.00, 'TRY', @catElektronik, N'DemoSound', N'adet', 1);

IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = @demoTenantId AND sku = 'MZD-DEMO-01')
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
    VALUES (@demoTenantId, 'MZD-DEMO-01', N'Demo Calisma Masasi', N'120x60cm, mese kaplama. Demo amaclidir.', 5999.00, 'TRY', @catMobilya, N'DemoWood', N'adet', 1);

IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = @demoTenantId AND sku = 'SNK-DEMO-01')
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
    VALUES (@demoTenantId, 'SNK-DEMO-01', N'Demo Ofis Sandalyesi', N'Ergonomik, ayarlanabilir yukseklik. Demo amaclidir.', 3499.00, 'TRY', @catMobilya, N'DemoComfort', N'adet', 1);

IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = @demoTenantId AND sku = 'DLR-DEMO-01')
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
    VALUES (@demoTenantId, 'DLR-DEMO-01', N'Demo Dosya Dolabi', N'4 cekmeceli, metal. Demo amaclidir.', 2299.00, 'TRY', @catMobilya, N'DemoOffice', N'adet', 1);

IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = @demoTenantId AND sku = 'YK-DEMO-01')
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
    VALUES (@demoTenantId, 'YK-DEMO-01', N'Demo Yazici', N'Renkli lazer, A4. Demo amaclidir.', 4999.00, 'TRY', @catOfis, N'DemoPrint', N'adet', 1);

IF NOT EXISTS (SELECT 1 FROM products WHERE tenant_id = @demoTenantId AND sku = 'KLT-DEMO-01')
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, is_active)
    VALUES (@demoTenantId, 'KLT-DEMO-01', N'Demo Monitor 27"', N'4K IPS, HDMI+DP. Demo amaclidir.', 7999.00, 'TRY', @catElektronik, N'DemoDisplay', N'adet', 1);

-- Customers
IF NOT EXISTS (SELECT 1 FROM customers WHERE tenant_id = @demoTenantId AND name = N'Acme Tekstil Ltd.')
    INSERT INTO customers (tenant_id, name, contact_name, email, phone, tax_number, tax_office, is_active)
    VALUES (@demoTenantId, N'Acme Tekstil Ltd.', N'Mehmet Yilmaz', N'info@acme-demo.com', N'+90 212 555 0001', N'1111111111', N'Besiktas', 1);

IF NOT EXISTS (SELECT 1 FROM customers WHERE tenant_id = @demoTenantId AND name = N'Beta Muhendislik A.S.')
    INSERT INTO customers (tenant_id, name, contact_name, email, phone, tax_number, tax_office, is_active)
    VALUES (@demoTenantId, N'Beta Muhendislik A.S.', N'Ayse Kaya', N'ayse@beta-demo.com', N'+90 532 111 0002', N'2222222222', N'Cankaya', 1);

IF NOT EXISTS (SELECT 1 FROM customers WHERE tenant_id = @demoTenantId AND name = N'Gamma Ltd. Sti.')
    INSERT INTO customers (tenant_id, name, contact_name, phone, address, is_active)
    VALUES (@demoTenantId, N'Gamma Ltd. Sti.', N'Ali Demir', N'+90 555 999 0003', N'Demo Adres 3, Izmir', 1);

-- Sample catalog (idempotent: tenant_id var ilk katalog varsa skip)
IF NOT EXISTS (SELECT 1 FROM catalogs WHERE tenant_id = @demoTenantId)
BEGIN
    DECLARE @catalogId UNIQUEIDENTIFIER = NEWID();
    INSERT INTO catalogs (id, tenant_id, name, description, status)
    VALUES (@catalogId, @demoTenantId, N'Demo Ilkbahar Katalogu', N'Demo amacli ornek katalog.', 'active');

    INSERT INTO catalog_items (catalog_id, product_id, sort_order)
    SELECT @catalogId, id, ROW_NUMBER() OVER (ORDER BY name) - 1
    FROM products WHERE tenant_id = @demoTenantId;

    INSERT INTO catalog_customers (catalog_id, customer_id)
    SELECT @catalogId, id FROM customers WHERE tenant_id = @demoTenantId;

    INSERT INTO catalog_field_config (catalog_id, field_name, is_visible, sort_order)
    VALUES (@catalogId, 'sku', 1, 0), (@catalogId, 'name', 1, 1), (@catalogId, 'description', 1, 2),
           (@catalogId, 'price', 1, 3), (@catalogId, 'currency', 1, 4), (@catalogId, 'category', 1, 5),
           (@catalogId, 'brand', 1, 6), (@catalogId, 'unit', 1, 7), (@catalogId, 'notes', 1, 8),
           (@catalogId, 'images', 1, 9);
END

COMMIT;
PRINT N'Demo seed tamamlandi. Email: demo@digicatalog.local / Sifre: Demo123!';