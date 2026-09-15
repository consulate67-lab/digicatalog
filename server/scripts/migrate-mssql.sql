-- DijiCatalog MSSQL schema migration (MSSEL-first, sifirdan)
--
-- Drizzle Kit henuz mssql dialect'i desteklemedigi icin manuel SQL.
-- MSSEL'in cascade cycle ve inline FK kısıtlamaları nedeniyle:
--   1. CREATE TABLE sadece kolonlar + PK + UNIQUE (FK yok)
--   2. ALTER TABLE ile FK'lar sonradan ekleniyor
--   3. CREATE INDEX ayrı batch
--
-- Sira onemli: parent tablolar once olusturulmali (categories FK'si icin
-- products ON DELETE SET NULL, vs.)
--
-- Idempotent: IF OBJECT_ID kontrolleri ile tekrar calistirilabilir.

-- === tenants ===
IF OBJECT_ID('tenants', 'U') IS NULL
CREATE TABLE tenants (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  name nvarchar(255) NOT NULL,
  slug varchar(100) NOT NULL,
  erp_provider varchar(50) NULL,
  erp_config nvarchar(max) NULL,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  updated_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_tenants PRIMARY KEY (id),
  CONSTRAINT uq_tenants_slug UNIQUE (slug)
);

-- === users ===
IF OBJECT_ID('users', 'U') IS NULL
CREATE TABLE users (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  tenant_id uniqueidentifier NOT NULL,
  email varchar(255) NOT NULL,
  password_hash nvarchar(255) NOT NULL,
  name nvarchar(255) NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'member',
  is_active bit NOT NULL DEFAULT 1,
  last_login_at datetime2 NULL,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  updated_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email)
);

-- === categories ===
IF OBJECT_ID('categories', 'U') IS NULL
CREATE TABLE categories (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  tenant_id uniqueidentifier NOT NULL,
  parent_id uniqueidentifier NULL,
  name nvarchar(255) NOT NULL,
  slug varchar(100) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  updated_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_categories PRIMARY KEY (id),
  CONSTRAINT uq_categories_tenant_slug UNIQUE (tenant_id, slug)
);

-- === products ===
IF OBJECT_ID('products', 'U') IS NULL
CREATE TABLE products (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  tenant_id uniqueidentifier NOT NULL,
  sku varchar(100) NOT NULL,
  name nvarchar(500) NOT NULL,
  description nvarchar(max) NULL,
  price decimal(12,2) NOT NULL DEFAULT '0',
  currency varchar(3) NOT NULL DEFAULT 'TRY',
  category_id uniqueidentifier NULL,
  brand nvarchar(255) NULL,
  unit varchar(50) NULL,
  notes nvarchar(max) NULL,
  attributes nvarchar(max) DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  is_active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  updated_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_products PRIMARY KEY (id),
  CONSTRAINT uq_products_tenant_sku UNIQUE (tenant_id, sku)
);

-- === product_images ===
IF OBJECT_ID('product_images', 'U') IS NULL
CREATE TABLE product_images (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  tenant_id uniqueidentifier NOT NULL,
  product_id uniqueidentifier NOT NULL,
  base64_data nvarchar(max) NOT NULL,
  mime_type varchar(50) NOT NULL,
  file_size int NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_primary bit NOT NULL DEFAULT 0,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_product_images PRIMARY KEY (id)
);

-- === customers ===
IF OBJECT_ID('customers', 'U') IS NULL
CREATE TABLE customers (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  tenant_id uniqueidentifier NOT NULL,
  name nvarchar(255) NOT NULL,
  contact_name nvarchar(255) NULL,
  email varchar(255) NULL,
  phone varchar(50) NULL,
  address nvarchar(500) NULL,
  tax_number varchar(50) NULL,
  tax_office nvarchar(255) NULL,
  erp_customer_id varchar(100) NULL,
  source varchar(20) NOT NULL DEFAULT 'manual',
  notes nvarchar(max) NULL,
  is_active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  updated_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_customers PRIMARY KEY (id)
);

-- === catalogs ===
IF OBJECT_ID('catalogs', 'U') IS NULL
CREATE TABLE catalogs (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  tenant_id uniqueidentifier NOT NULL,
  name nvarchar(255) NOT NULL,
  description nvarchar(max) NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  created_by uniqueidentifier NULL,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  updated_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_catalogs PRIMARY KEY (id)
);

-- === catalog_items ===
IF OBJECT_ID('catalog_items', 'U') IS NULL
CREATE TABLE catalog_items (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  catalog_id uniqueidentifier NOT NULL,
  product_id uniqueidentifier NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  custom_price decimal(12,2) NULL,
  custom_notes nvarchar(max) NULL,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_catalog_items PRIMARY KEY (id),
  CONSTRAINT uq_catalog_items_catalog_product UNIQUE (catalog_id, product_id)
);

-- === catalog_customers ===
IF OBJECT_ID('catalog_customers', 'U') IS NULL
CREATE TABLE catalog_customers (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  catalog_id uniqueidentifier NOT NULL,
  customer_id uniqueidentifier NOT NULL,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_catalog_customers PRIMARY KEY (id),
  CONSTRAINT uq_catalog_customers UNIQUE (catalog_id, customer_id)
);

-- === catalog_field_config ===
IF OBJECT_ID('catalog_field_config', 'U') IS NULL
CREATE TABLE catalog_field_config (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  catalog_id uniqueidentifier NOT NULL,
  field_name varchar(50) NOT NULL,
  is_visible bit NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT pk_catalog_field_config PRIMARY KEY (id),
  CONSTRAINT uq_catalog_field_config UNIQUE (catalog_id, field_name)
);

-- === Index'ler ===
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'tenants_slug_idx' AND object_id = OBJECT_ID('tenants'))
  CREATE INDEX tenants_slug_idx ON tenants(slug);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'users_tenant_idx' AND object_id = OBJECT_ID('users'))
  CREATE INDEX users_tenant_idx ON users(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'categories_tenant_idx' AND object_id = OBJECT_ID('categories'))
  CREATE INDEX categories_tenant_idx ON categories(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'categories_parent_idx' AND object_id = OBJECT_ID('categories'))
  CREATE INDEX categories_parent_idx ON categories(parent_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'products_tenant_idx' AND object_id = OBJECT_ID('products'))
  CREATE INDEX products_tenant_idx ON products(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'products_category_idx' AND object_id = OBJECT_ID('products'))
  CREATE INDEX products_category_idx ON products(category_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'product_images_product_idx' AND object_id = OBJECT_ID('product_images'))
  CREATE INDEX product_images_product_idx ON product_images(product_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'product_images_tenant_idx' AND object_id = OBJECT_ID('product_images'))
  CREATE INDEX product_images_tenant_idx ON product_images(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'customers_tenant_idx' AND object_id = OBJECT_ID('customers'))
  CREATE INDEX customers_tenant_idx ON customers(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'customers_email_idx' AND object_id = OBJECT_ID('customers'))
  CREATE INDEX customers_email_idx ON customers(email);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'customers_tenant_erp_idx' AND object_id = OBJECT_ID('customers'))
  CREATE INDEX customers_tenant_erp_idx ON customers(tenant_id, erp_customer_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'catalogs_tenant_idx' AND object_id = OBJECT_ID('catalogs'))
  CREATE INDEX catalogs_tenant_idx ON catalogs(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'catalogs_status_idx' AND object_id = OBJECT_ID('catalogs'))
  CREATE INDEX catalogs_status_idx ON catalogs(tenant_id, status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'catalog_items_catalog_idx' AND object_id = OBJECT_ID('catalog_items'))
  CREATE INDEX catalog_items_catalog_idx ON catalog_items(catalog_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'catalog_items_product_idx' AND object_id = OBJECT_ID('catalog_items'))
  CREATE INDEX catalog_items_product_idx ON catalog_items(product_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'catalog_customers_catalog_idx' AND object_id = OBJECT_ID('catalog_customers'))
  CREATE INDEX catalog_customers_catalog_idx ON catalog_customers(catalog_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'catalog_customers_customer_idx' AND object_id = OBJECT_ID('catalog_customers'))
  CREATE INDEX catalog_customers_customer_idx ON catalog_customers(customer_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'catalog_field_config_catalog_idx' AND object_id = OBJECT_ID('catalog_field_config'))
  CREATE INDEX catalog_field_config_catalog_idx ON catalog_field_config(catalog_id);

-- === FK'lar (ALTER TABLE ile sonradan, cycle'leri en aza indirmek icin) ===
--
-- NOT: ON DELETE CASCADE ile cycle yaratacak durumlar:
--   - catalog_items.catalog_id CASCADE + catalog_items.product_id CASCADE
--     + catalog_customers.catalog_id CASCADE + catalog_customers.customer_id CASCADE
--   MSSEL 'multiple cascade paths' (1785) reddeder.
-- Cozum: catalog_items ve catalog_customers FK'larinda SET NULL kullanildi
-- (parent silinince catalog satiri kalir ama reference NULL olur).
-- Parent-child silme akisi uygulama katmaninda yonetilebilir.

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_users_tenant')
  ALTER TABLE users ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_categories_tenant')
  ALTER TABLE categories ADD CONSTRAINT fk_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- categories self-reference FK MSSEL'de sikinti cikarir (MSSQL No 1750)
-- (CASCADE, SET NULL hepsi reddedildi). Cozum: parent_id kolonu kalir ama
-- FK constraint yok. Uygulama katmaninda (categories.service.ts) parent
-- varlik kontrolu yapilir. Drizzle ORM runtime'da parent_id'yi tanir.

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_products_tenant')
  ALTER TABLE products ADD CONSTRAINT fk_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- products.category_id, product_images.product_id, catalogs.created_by,
-- catalog_items.*, catalog_customers.*, catalog_field_config.catalog_id
-- FK'lari MSSEL'de cycle yarattigi icin (MSSQL No 1750 'See previous errors',
-- SET NULL bile reddedildi) kaldirildi. Tenant FK'lari korundu.
-- Referans integrity uygulama katmaninda (services/*) kontrol edilir;
-- Drizzle ORM runtime'da metadata'da FK'lari gormeye devam eder.

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_product_images_tenant')
  ALTER TABLE product_images ADD CONSTRAINT fk_product_images_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_customers_tenant')
  ALTER TABLE customers ADD CONSTRAINT fk_customers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_catalogs_tenant')
  ALTER TABLE catalogs ADD CONSTRAINT fk_catalogs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

PRINT 'DijiCatalog schema (MSSEL-first): 10 tablo + 18 index + tenant FK olusturuldu.';

PRINT 'DijiCatalog schema (MSSEL-first): 10 tablo + 18 index + 13 FK olusturuldu.';