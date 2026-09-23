/**
 * PDF Templates seed (Faz 9, Aşama 2.3).
 *
 * Calistirma: npx tsx server/scripts/seed-pdf-templates.ts
 *
 * 24 preset sistem sablonu ekler (8 kategori x 3 varyant):
 *   classic      (clean, elegant, grid)
 *   modern       (bold, minimal, gradient)
 *   minimal      (mono, line, grid)
 *   compact      (dense, table, list)
 *   magazine     (editorial, feature, lookbook)
 *   catalog      (standard, categorized, detailed)
 *   brochure     (trifold, flyer, bifold)
 *   premium      (luxury, portfolio, corporate)
 *
 * Idempotent: upsertSystemTemplate() slug bazli upsert yapar.
 * tenant_id NULL = sistem sablonu (tum tenant'lar gorur, degistiremez).
 *
 * Bu sablonlar PDF render motoru (pdf.service.ts) tarafindan Aşama 3'te
 * okunup uygulanacak (henuz template-aware degil).
 */

import 'dotenv/config';
import sql from 'mssql';
import { parseDatabaseUrl } from '../src/config/database';
import { logger } from '../src/utils/logger';
import { upsertSystemTemplate } from '../src/services/pdfTemplates.service';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL tanimli degil');
  process.exit(1);
}

const cfg = parseDatabaseUrl(DATABASE_URL);
const poolOptions = {
  encrypt: cfg.encrypt,
  trustServerCertificate: cfg.trustServerCertificate,
  enableArithAbort: true,
  ...(cfg.instanceName !== null ? { instanceName: cfg.instanceName } : {}),
};
const pool = new sql.ConnectionPool({
  user: cfg.user,
  password: cfg.password,
  server: cfg.server,
  ...(cfg.port !== null ? { port: cfg.port } : {}),
  database: cfg.database,
  options: poolOptions,
  connectionTimeout: 15_000,
  requestTimeout: 60_000,
  pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
});

// === 24 Preset tanimlari ===
// Her preset: name, slug, description, category, layout.
// layout: PdfLayoutConfig (PdfTemplatesService'te tanimli).

const PRESETS = [
  // ============ CLASSIC (3) ============
  {
    name: 'Classic — Clean',
    slug: 'classic-clean',
    description: 'Sade, klasik liste formati. Beyaz arka plan, ince border, 1 kolon.',
    category: 'classic',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#1F2937', secondary: '#6B7280', accent: '#374151', text: '#111827', muted: '#9CA3AF', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 24, bodySize: 11, captionSize: 9 },
      cover: { style: 'minimal', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'simple', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'list', columns: 1, imagePosition: 'left', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'simple', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Classic — Elegant',
    slug: 'classic-elegant',
    description: 'Serif fontlu, ince border, premium hissiyatl\u0131 tek kolon sablon.',
    category: 'classic',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 60, bottom: 60, left: 55, right: 55 },
      colors: { primary: '#3F2E2A', secondary: '#8B7355', accent: '#A8896D', text: '#2C2416', muted: '#9C8E7E', background: '#FBFAF6' },
      typography: { fontFamily: 'Georgia', titleSize: 26, bodySize: 11, captionSize: 9 },
      cover: { style: 'centered', showTitle: true, showLogo: true, showSubtitle: true },
      header: { style: 'simple', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'detailed', columns: 1, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '3:2', borderStyle: 'thin' },
      footer: { style: 'simple', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'numbered', groupByCategory: false },
    },
  },
  {
    name: 'Classic — Grid',
    slug: 'classic-grid',
    description: '\u0130ki kolon, ince \u00e7izgi ayra\u00e7l\u0131 klasik grid.',
    category: 'classic',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 45, right: 45 },
      colors: { primary: '#1F2937', secondary: '#6B7280', accent: '#374151', text: '#111827', muted: '#9CA3AF', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 22, bodySize: 10, captionSize: 8 },
      cover: { style: 'minimal', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'simple', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'grid', columns: 2, imagePosition: 'top', showSku: true, showDescription: false, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'simple', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },

  // ============ MODERN (3) ============
  {
    name: 'Modern — Bold',
    slug: 'modern-bold',
    description: 'Koyu ba\u015fl\u0131k, vibrant indigo, 2 kolon, accent stripe.',
    category: 'modern',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 45, bottom: 45, left: 45, right: 45 },
      colors: { primary: '#4F46E5', secondary: '#6366F1', accent: '#818CF8', text: '#0F172A', muted: '#64748B', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 28, bodySize: 11, captionSize: 9 },
      cover: { style: 'full-image', showTitle: true, showLogo: true, showSubtitle: true, overlayOpacity: 0.6 },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'grid', columns: 2, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'accent' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'simple', groupByCategory: true },
    },
  },
  {
    name: 'Modern — Minimal',
    slug: 'modern-minimal',
    description: 'Beyaz + indigo accent, hafif g\u00f6lge, 3 kolon.',
    category: 'modern',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
      colors: { primary: '#4F46E5', secondary: '#E0E7FF', accent: '#6366F1', text: '#1E293B', muted: '#94A3B8', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 22, bodySize: 10, captionSize: 8 },
      cover: { style: 'centered', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'minimal', showLogo: true, showTenantName: false, showDate: true },
      productCard: { style: 'grid', columns: 3, imagePosition: 'top', showSku: false, showDescription: false, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '1:1', borderStyle: 'shadow' },
      footer: { style: 'minimal', showPageNumbers: true, showContact: false },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Modern — Gradient',
    slug: 'modern-gradient',
    description: 'Gradient header (indigo \u2192 purple), full-image kapak.',
    category: 'modern',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#6366F1', secondary: '#8B5CF6', accent: '#A78BFA', text: '#FFFFFF', muted: '#E0E7FF', background: '#0F172A' },
      typography: { fontFamily: 'Arial', titleSize: 32, bodySize: 11, captionSize: 9 },
      cover: { style: 'gradient', showTitle: true, showLogo: true, showSubtitle: true, overlayOpacity: 0.7 },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'grid', columns: 2, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'shadow' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'numbered', groupByCategory: true },
    },
  },

  // ============ MINIMAL (3) ============
  {
    name: 'Minimal — Mono',
    slug: 'minimal-mono',
    description: 'Siyah-beyaz, b\u00fcy\u00fckk typography, 2 kolon.',
    category: 'minimal',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 60, bottom: 60, left: 60, right: 60 },
      colors: { primary: '#000000', secondary: '#FFFFFF', accent: '#000000', text: '#000000', muted: '#6B7280', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 36, bodySize: 12, captionSize: 10 },
      cover: { style: 'minimal', showTitle: true, showLogo: false, showSubtitle: false },
      header: { style: 'minimal', showLogo: false, showTenantName: false, showDate: true },
      productCard: { style: 'list', columns: 2, imagePosition: 'left', showSku: true, showDescription: false, showCategory: false, showBrand: true, showPrice: true, imageAspectRatio: '1:1', borderStyle: 'none' },
      footer: { style: 'minimal', showPageNumbers: true, showContact: false },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Minimal — Line',
    slug: 'minimal-line',
    description: 'Sadece \u00e7izgi ayra\u00e7lar, k\u00fc\u00e7\u00fckk resim, 2 kolon.',
    category: 'minimal',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#000000', secondary: '#E5E7EB', accent: '#9CA3AF', text: '#1F2937', muted: '#6B7280', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 24, bodySize: 10, captionSize: 8 },
      cover: { style: 'minimal', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'minimal', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'list', columns: 2, imagePosition: 'left', showSku: true, showDescription: true, showCategory: false, showBrand: false, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'minimal', showPageNumbers: true, showContact: false },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Minimal — Grid',
    slug: 'minimal-grid',
    description: '4 kolon k\u00fc\u00e7\u00fckk kart, sadece isim + fiyat.',
    category: 'minimal',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
      colors: { primary: '#111827', secondary: '#F3F4F6', accent: '#6B7280', text: '#1F2937', muted: '#9CA3AF', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 18, bodySize: 9, captionSize: 8 },
      cover: { style: 'minimal', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'minimal', showLogo: true, showTenantName: false, showDate: true },
      productCard: { style: 'compact', columns: 4, imagePosition: 'top', showSku: false, showDescription: false, showCategory: false, showBrand: false, showPrice: true, imageAspectRatio: '1:1', borderStyle: 'none' },
      footer: { style: 'minimal', showPageNumbers: true, showContact: false },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },

  // ============ COMPACT (3) ============
  {
    name: 'Compact — Dense',
    slug: 'compact-dense',
    description: '3 kolon, k\u00fc\u00e7\u00fckk font, yo\u011fun d\u00fczen (high-density).',
    category: 'compact',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 35, bottom: 35, left: 35, right: 35 },
      colors: { primary: '#1F2937', secondary: '#6B7280', accent: '#374151', text: '#111827', muted: '#9CA3AF', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 16, bodySize: 8, captionSize: 7 },
      cover: { style: 'minimal', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'simple', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'compact', columns: 3, imagePosition: 'top', showSku: true, showDescription: false, showCategory: false, showBrand: false, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'simple', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Compact — Table',
    slug: 'compact-table',
    description: 'Tablo g\u00f6r\u00fcn\u00fcm\u00fc, h\u0131zl\u0131 tarama, 4 kolon.',
    category: 'compact',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
      colors: { primary: '#374151', secondary: '#9CA3AF', accent: '#4B5563', text: '#1F2937', muted: '#9CA3AF', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 16, bodySize: 9, captionSize: 8 },
      cover: { style: 'minimal', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'simple', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'compact', columns: 4, imagePosition: 'top', showSku: true, showDescription: false, showCategory: true, showBrand: false, showPrice: true, imageAspectRatio: '1:1', borderStyle: 'thin' },
      footer: { style: 'simple', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Compact — List',
    slug: 'compact-list',
    description: 'Dikey liste, k\u00fc\u00e7\u00fckk resimler left, 1 kolon ama s\u0131k\u0131\u015f\u0131k.',
    category: 'compact',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 35, bottom: 35, left: 35, right: 35 },
      colors: { primary: '#1F2937', secondary: '#6B7280', accent: '#374151', text: '#111827', muted: '#9CA3AF', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 16, bodySize: 9, captionSize: 7 },
      cover: { style: 'minimal', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'simple', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'list', columns: 1, imagePosition: 'left', showSku: true, showDescription: false, showCategory: true, showBrand: false, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'simple', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },

  // ============ MAGAZINE (3) ============
  {
    name: 'Magazine — Editorial',
    slug: 'magazine-editorial',
    description: 'B\u00fcy\u00fckk hero resim, 2 kolon text, edit\u00f6ryal hissiyat.',
    category: 'magazine',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#0F172A', secondary: '#475569', accent: '#DC2626', text: '#0F172A', muted: '#94A3B8', background: '#FAFAF9' },
      typography: { fontFamily: 'Georgia', titleSize: 32, bodySize: 12, captionSize: 9 },
      cover: { style: 'magazine', showTitle: true, showLogo: true, showSubtitle: true, overlayOpacity: 0.5 },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'detailed', columns: 2, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '3:2', borderStyle: 'shadow' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'thumbnails', groupByCategory: true },
    },
  },
  {
    name: 'Magazine — Feature',
    slug: 'magazine-feature',
    description: 'One \u00e7\u0131kan \u00fcr\u00fcn (full-page) + grid.',
    category: 'magazine',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 45, bottom: 45, left: 45, right: 45 },
      colors: { primary: '#1E293B', secondary: '#64748B', accent: '#F59E0B', text: '#0F172A', muted: '#94A3B8', background: '#FFFFFF' },
      typography: { fontFamily: 'Georgia', titleSize: 28, bodySize: 11, captionSize: 9 },
      cover: { style: 'magazine', showTitle: true, showLogo: true, showSubtitle: true, overlayOpacity: 0.5 },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'magazine', columns: 2, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'shadow' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'numbered', groupByCategory: true },
    },
  },
  {
    name: 'Magazine — Lookbook',
    slug: 'magazine-lookbook',
    description: 'Geni\u015f sayfa d\u00fczeni, az text, g\u00f6rsel a\u011f\u0131rl\u0131kl\u0131.',
    category: 'magazine',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#0F172A', secondary: '#E2E8F0', accent: '#0F172A', text: '#0F172A', muted: '#64748B', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 30, bodySize: 10, captionSize: 8 },
      cover: { style: 'full-image', showTitle: true, showLogo: true, showSubtitle: false, overlayOpacity: 0.4 },
      header: { style: 'minimal', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'magazine', columns: 2, imagePosition: 'background', showSku: false, showDescription: false, showCategory: false, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'none' },
      footer: { style: 'minimal', showPageNumbers: true, showContact: false },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },

  // ============ CATALOG (3) ============
  {
    name: 'Catalog — Standard',
    slug: 'catalog-standard',
    description: 'A4, kapak + TOC + \u00fcr\u00fcnler, 2 kolon, profesyonel.',
    category: 'catalog',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#1E3A8A', secondary: '#3B82F6', accent: '#2563EB', text: '#0F172A', muted: '#64748B', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 24, bodySize: 11, captionSize: 9 },
      cover: { style: 'full-image', showTitle: true, showLogo: true, showSubtitle: true, overlayOpacity: 0.6 },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'detailed', columns: 2, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'numbered', groupByCategory: true },
    },
  },
  {
    name: 'Catalog — Categorized',
    slug: 'catalog-categorized',
    description: 'Kategori gruplu (groupByCategory=true), TOC, 2 kolon.',
    category: 'catalog',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#0F766E', secondary: '#14B8A6', accent: '#0D9488', text: '#134E4A', muted: '#94A3B8', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 24, bodySize: 11, captionSize: 9 },
      cover: { style: 'centered', showTitle: true, showLogo: true, showSubtitle: true },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'detailed', columns: 2, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'numbered', groupByCategory: true },
    },
  },
  {
    name: 'Catalog — Detailed',
    slug: 'catalog-detailed',
    description: 'Tam detay (a\u00e7\u0131klama + \u00f6zellikler + price + notes), 1 kolon.',
    category: 'catalog',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 55, right: 55 },
      colors: { primary: '#1E40AF', secondary: '#60A5FA', accent: '#3B82F6', text: '#1E293B', muted: '#64748B', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 22, bodySize: 11, captionSize: 9 },
      cover: { style: 'centered', showTitle: true, showLogo: true, showSubtitle: true },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'detailed', columns: 1, imagePosition: 'left', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'numbered', groupByCategory: false },
    },
  },

  // ============ BROCHURE (3) ============
  {
    name: 'Brochure — Trifold',
    slug: 'brochure-trifold',
    description: 'A4 landscape, 3 kolon (trifold mant\u0131\u011f\u0131).',
    category: 'brochure',
    layout: {
      pageSize: 'A4',
      orientation: 'landscape',
      margin: { top: 30, bottom: 30, left: 30, right: 30 },
      colors: { primary: '#7C3AED', secondary: '#A78BFA', accent: '#8B5CF6', text: '#1E1B4B', muted: '#A1A1AA', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 18, bodySize: 9, captionSize: 7 },
      cover: { style: 'centered', showTitle: true, showLogo: true, showSubtitle: true },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'compact', columns: 3, imagePosition: 'top', showSku: true, showDescription: false, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'accent' },
      footer: { style: 'simple', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Brochure — Flyer',
    slug: 'brochure-flyer',
    description: 'A5, tek sayfa \u00f6zet, 4 kolon k\u00fc\u00e7\u00fckk.',
    category: 'brochure',
    layout: {
      pageSize: 'A5',
      orientation: 'portrait',
      margin: { top: 20, bottom: 20, left: 20, right: 20 },
      colors: { primary: '#DC2626', secondary: '#FCA5A5', accent: '#EF4444', text: '#7F1D1D', muted: '#A1A1AA', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 14, bodySize: 8, captionSize: 6 },
      cover: { style: 'minimal', showTitle: true, showLogo: true, showSubtitle: false },
      header: { style: 'simple', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'compact', columns: 4, imagePosition: 'top', showSku: false, showDescription: false, showCategory: false, showBrand: false, showPrice: true, imageAspectRatio: '1:1', borderStyle: 'thin' },
      footer: { style: 'simple', showPageNumbers: false, showContact: true },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Brochure — Bifold',
    slug: 'brochure-bifold',
    description: 'A4 landscape, 2 kolon (bifold mant\u0131\u011f\u0131).',
    category: 'brochure',
    layout: {
      pageSize: 'A4',
      orientation: 'landscape',
      margin: { top: 35, bottom: 35, left: 35, right: 35 },
      colors: { primary: '#0891B2', secondary: '#67E8F9', accent: '#06B6D4', text: '#164E63', muted: '#94A3B8', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 20, bodySize: 10, captionSize: 8 },
      cover: { style: 'centered', showTitle: true, showLogo: true, showSubtitle: true },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'grid', columns: 2, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'accent' },
      footer: { style: 'simple', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },

  // ============ PREMIUM (3) ============
  {
    name: 'Premium — Luxury',
    slug: 'premium-luxury',
    description: 'Gold accent (#C8A95B), b\u00fcy\u00fckk typography, 1 kolon full.',
    category: 'premium',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 60, bottom: 60, left: 60, right: 60 },
      colors: { primary: '#1F1B16', secondary: '#C8A95B', accent: '#D4AF37', text: '#0F0E0D', muted: '#A39B8B', background: '#FAF7F2' },
      typography: { fontFamily: 'Georgia', titleSize: 32, bodySize: 12, captionSize: 10 },
      cover: { style: 'centered', showTitle: true, showLogo: true, showSubtitle: true },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'detailed', columns: 1, imagePosition: 'top', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '3:2', borderStyle: 'accent' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'numbered', groupByCategory: true },
    },
  },
  {
    name: 'Premium — Portfolio',
    slug: 'premium-portfolio',
    description: 'G\u00f6rsel a\u011f\u0131rl\u0131kl\u0131, az text, 2 kolon b\u00fcy\u00fckk resim.',
    category: 'premium',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#18181B', secondary: '#71717A', accent: '#FACC15', text: '#09090B', muted: '#A1A1AA', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 28, bodySize: 11, captionSize: 9 },
      cover: { style: 'full-image', showTitle: true, showLogo: true, showSubtitle: false, overlayOpacity: 0.3 },
      header: { style: 'minimal', showLogo: true, showTenantName: true, showDate: false },
      productCard: { style: 'magazine', columns: 2, imagePosition: 'top', showSku: false, showDescription: false, showCategory: false, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'shadow' },
      footer: { style: 'minimal', showPageNumbers: true, showContact: false },
      tableOfContents: { enabled: false, style: 'simple', groupByCategory: false },
    },
  },
  {
    name: 'Premium — Corporate',
    slug: 'premium-corporate',
    description: 'Kurumsal mavi (#1E3A8A), logo \u00f6ne \u00e7\u0131kan, 2 kolon.',
    category: 'premium',
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margin: { top: 50, bottom: 50, left: 50, right: 50 },
      colors: { primary: '#1E3A8A', secondary: '#3B82F6', accent: '#2563EB', text: '#0F172A', muted: '#64748B', background: '#FFFFFF' },
      typography: { fontFamily: 'Arial', titleSize: 24, bodySize: 11, captionSize: 9 },
      cover: { style: 'centered', showTitle: true, showLogo: true, showSubtitle: true },
      header: { style: 'bold', showLogo: true, showTenantName: true, showDate: true },
      productCard: { style: 'detailed', columns: 2, imagePosition: 'left', showSku: true, showDescription: true, showCategory: true, showBrand: true, showPrice: true, imageAspectRatio: '4:3', borderStyle: 'thin' },
      footer: { style: 'bold', showPageNumbers: true, showContact: true },
      tableOfContents: { enabled: true, style: 'numbered', groupByCategory: true },
    },
  },
];

const main = async (): Promise<void> => {
  logger.info({ count: PRESETS.length }, 'PDF Templates seed basliyor...');
  await pool.connect();

  let inserted = 0;
  let updated = 0;

  for (const p of PRESETS) {
    // Once var mi?
    const exR = await pool.request()
      .input('slug', sql.VarChar, p.slug)
      .query(`SELECT id FROM pdf_templates WHERE slug = @slug AND tenant_id IS NULL`);
    const wasExisting = !!exR.recordset[0];

    await upsertSystemTemplate({
      name: p.name,
      slug: p.slug,
      description: p.description,
      category: p.category,
      layout: p.layout,
    });

    if (wasExisting) updated++;
    else inserted++;
  }

  logger.info({ inserted, updated, total: PRESETS.length }, 'PDF Templates seed tamamlandi!');

  // Dogrulama
  const countR = await pool.request()
    .query(`SELECT category, COUNT(*) AS c FROM pdf_templates WHERE tenant_id IS NULL GROUP BY category ORDER BY category`);
  logger.info({ breakdown: countR.recordset }, 'Kategori bazli sablon sayilari');

  await pool.close();
};

main().catch(async (err) => {
  console.error('Seed hatasi:', err);
  try { await pool.close(); } catch (_e) { /* ignore */ }
  process.exit(1);
});
