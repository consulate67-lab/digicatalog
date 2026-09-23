-- 0005_layout_overrides.sql
-- Faz 10.2: catalog_pdf_settings tablosuna layout override kolonlari.
--
-- Mevcut schema 0004'te sadece field toggles vardi. LayoutEditor
-- (Faz 10.2) ile kullanici asagidaki alanlari katalog bazinda override
-- edebilir:
--   - products_per_page: sayfa basina urun sayisi (4/6/8/12/16/24)
--   - page_background_color: hex renk (orn. #F8FAFC), default = NULL (template'den gelir)
--   - page_background_type: 'solid' | 'gradient', default = 'solid'
--   - cover_style_override: kapak tasarim varyanti (5 deger),
--     NULL = template'in cover_style'i kullanilir
--
-- Idempotent: ALTER sadece kolon yoksa calisir (sys.columns check).
-- Yeni kurulumlar icin IF OBJECT_ID kontrolu zaten 0004'te var.

IF OBJECT_ID('catalog_pdf_settings', 'U') IS NOT NULL
BEGIN
  -- products_per_page
  IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('catalog_pdf_settings')
      AND name = 'products_per_page'
  )
    ALTER TABLE catalog_pdf_settings
      ADD products_per_page int NULL;

  -- page_background_color
  IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('catalog_pdf_settings')
      AND name = 'page_background_color'
  )
    ALTER TABLE catalog_pdf_settings
      ADD page_background_color varchar(7) NULL;  -- #RRGGBB

  -- page_background_type
  IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('catalog_pdf_settings')
      AND name = 'page_background_type'
  )
    ALTER TABLE catalog_pdf_settings
      ADD page_background_type varchar(20) NOT NULL
        CONSTRAINT df_catalog_pdf_settings_bg_type DEFAULT 'solid';

  -- cover_style_override
  IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('catalog_pdf_settings')
      AND name = 'cover_style_override'
  )
    ALTER TABLE catalog_pdf_settings
      ADD cover_style_override varchar(30) NULL;
END
GO

-- Backfill: mevcut satirlara page_background_type='solid' yaz (NOT NULL default zaten var,
-- ama SQL Server bazen default'u mevcut satirlara uygulamaz — explicit UPDATE daha guvenli).
IF OBJECT_ID('catalog_pdf_settings', 'U') IS NOT NULL
  UPDATE catalog_pdf_settings
  SET page_background_type = 'solid'
  WHERE page_background_type IS NULL;
GO