-- Faz 9: PDF Templates + Musteri Paylasimi
-- Yeni tablolar: pdf_templates, catalog_pdf_settings, catalog_shares
--
-- pdf_t-templates: hem sistem (tenant_id NULL) hem tenant-ozel sablonlar.
-- Sistem sablonlari is_system=1, silinemez, tenant_id NULL.
-- Tenant ozel sablonlar is_system=0, tenant_id dolu, ON DELETE CASCADE.
--
-- catalog_pdf_settings: her katalog icin secili template + field toggles
-- (logo, telefon, email, adres, sosyal medya, footer text, QR kod).
-- 1:1 iliski (katalog_id PK).
--
-- catalog_shares: musteri paylasimi (token-based, expiry kontrollu).
-- access_token UNIQUE (URL'de paylasilan anahtar).
-- created_by = users(id), expires_at ile gecerlilik kontrolu.
--
-- Idempotent: IF OBJECT_ID kontrolleri ile tekrar calistirilabilir.

-- === = pdf_templates ===
IF OBJECT_ID('pdf_templates', 'U') IS NULL
CREATE TABLE pdf_templates (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  name nvarchar(100) NOT NULL,
  slug varchar(50) NOT NULL,
  description nvarchar(500) NULL,
  category varchar(50) NOT NULL DEFAULT 'classic',
  layout_json nvarchar(max) NOT NULL,
  preview_image_base64 nvarchar(max) NULL,
  is_system bit NOT NULL DEFAULT 0,
  tenant_id uniqueidentifier NULL,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  updated_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_pdf_templates PRIMARY KEY (id)
);
IF OBJECT_ID('pdf_templates', 'U') IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('pdf_templates') AND name = 'preview_image_base64'
)
ALTER TABLE pdf_templates ADD preview_image_base64 nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('pdf_templates') AND name = 'ix_pdf_templates_tenant')
CREATE INDEX ix_pdf_templates_tenant ON pdf_templates(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('pdf_templates') AND name = 'ix_pdf_templates_slug')
CREATE INDEX ix_pdf_templates_slug ON pdf_templates(slug);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_pdf_templates_tenant')
ALTER TABLE pdf_templates
  ADD CONSTRAINT fk_pdf_templates_tenant FOREIGN KEY (tenant_id)
  REFERENCES tenants(id) ON DELETE CASCADE;

-- === = catalog_pdf_settings ===
IF OBJECT_ID('catalog_pdf_settings', 'U') IS NULL
CREATE TABLE catalog_pdf_settings (
  catalog_id uniqueidentifier NOT NULL,
  template_id uniqueidentifier NOT NULL,
  show_logo bit NOT NULL DEFAULT 1,
  show_phone bit NOT NULL DEFAULT 1,
  show_email bit NOT NULL DEFAULT 1,
  show_address bit NOT NULL DEFAULT 1,
  show_instagram bit NOT NULL DEFAULT 0,
  show_facebook bit NOT NULL DEFAULT 0,
  show_website bit NOT NULL DEFAULT 1,
  show_qr_code bit NOT NULL DEFAULT 0,
  custom_cover_title nvarchar(200) NULL,
  custom_footer_text nvarchar(max) NULL,
  qr_link_url nvarchar(500) NULL,
  updated_at datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT pk_catalog_pdf_settings PRIMARY KEY (catalog_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_catalog_pdf_settings_catalog')
ALTER TABLE catalog_pdf_settings
  ADD CONSTRAINT fk_catalog_pdf_settings_catalog FOREIGN KEY (catalog_id)
  REFERENCES catalogs(id) ON DELETE CASCADE;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_catalog_pdf_settings_template')
ALTER TABLE catalog_pdf_settings
  ADD CONSTRAINT fk_catalog_pdf_settings_template FOREIGN KEY (template_id)
  REFERENCES pdf_templates(id) ON DELETE NO ACTION;

-- === = catalog_shares ===
IF OBJECT_ID('catalog_shares', 'U') IS NULL
CREATE TABLE catalog_shares (
  id uniqueidentifier NOT NULL DEFAULT (newid()),
  catalog_id uniqueidentifier NOT NULL,
  customer_email nvarchar(255) NOT NULL,
  access_token varchar(64) NOT NULL,
  expires_at datetime2 NOT NULL,
  created_by uniqueidentifier NOT NULL,
  created_at datetime2 NOT NULL DEFAULT (getdate()),
  last_accessed_at datetime2 NULL,
  access_count int NOT NULL DEFAULT 0,
  CONSTRAINT pk_catalog_shares PRIMARY KEY (id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('catalog_shares') AND name = 'ix_catalog_shares_token')
CREATE UNIQUE INDEX ix_catalog_shares_token ON catalog_shares(access_token);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('catalog_shares') AND name = 'ix_catalog_shares_catalog')
CREATE INDEX ix_catalog_shares_catalog ON catalog_shares(catalog_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('catalog_shares') AND name = 'ix_catalog_shares_expires')
CREATE INDEX ix_catalog_shares_expires ON catalog_shares(expires_at);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_catalog_shares_catalog')
ALTER TABLE catalog_shares
  ADD CONSTRAINT fk_catalog_shares_catalog FOREIGN KEY (catalog_id)
  REFERENCES catalogs(id) ON DELETE CASCADE;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_catalog_shares_user')
ALTER TABLE catalog_shares
  ADD CONSTRAINT fk_catalog_shares_user FOREIGN KEY (created_by)
  REFERENCES users(id) ON DELETE NO ACTION;