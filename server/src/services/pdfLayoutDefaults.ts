import type { PdfLayoutConfig } from './pdfTemplates.service';

/**
 * Default PDF layout config (Faz 9).
 *
 * Tum preset'ler bu default'larla merge edilir (template'de
 * belirtilmemis alanlar default'tan gelir). Boylece 24 preset
 * minimal config tasir, geri kalan alanlar sensible default.
 *
 * Aşama 9.3.1 — render logic henuz bunlari kullanmiyor, sadece
 * setup layer (template resolution + catalog settings).
 * Asıl render refactoru Aşama 9.3.2'de.
 */

export const DEFAULT_LAYOUT: Required<PdfLayoutConfig> = {
  pageSize: 'A4',
  orientation: 'portrait',
  margin: { top: 50, bottom: 50, left: 50, right: 50 },
  colors: {
    primary: '#1F2937',
    secondary: '#6B7280',
    accent: '#374151',
    text: '#111827',
    muted: '#9CA3AF',
    background: '#FFFFFF',
  },
  typography: {
    fontFamily: 'Arial',
    titleSize: 24,
    bodySize: 11,
    captionSize: 9,
  },
  cover: {
    style: 'minimal',
    showTitle: true,
    showLogo: true,
    showSubtitle: false,
    overlayOpacity: 0,
  },
  header: {
    style: 'simple',
    showLogo: true,
    showTenantName: true,
    showDate: true,
  },
  productCard: {
    style: 'list',
    columns: 1,
    imagePosition: 'top',
    showSku: true,
    showDescription: true,
    showCategory: true,
    showBrand: true,
    showPrice: true,
    imageAspectRatio: '4:3',
    borderStyle: 'thin',
  },
  footer: {
    style: 'simple',
    showPageNumbers: true,
    showContact: true,
  },
  tableOfContents: {
    enabled: true,
    style: 'simple',
    groupByCategory: false,
  },
};

/**
 * Partial layout'u default'larla merge et. Deep merge — sadece top-level
 * field merge edilir (colors, margin, typography, vs. tamamen override
 * edilir veya default'a dusulur).
 *
 * Ornek:
 *   mergeLayoutWithDefaults({ pageSize: 'A5' })
 *   -> { pageSize: 'A5', orientation: 'portrait', margin: {...}, ... }
 */
export const mergeLayoutWithDefaults = (partial: PdfLayoutConfig | undefined | null): Required<PdfLayoutConfig> => {
  const p = partial ?? {};
  return {
    pageSize: p.pageSize ?? DEFAULT_LAYOUT.pageSize,
    orientation: p.orientation ?? DEFAULT_LAYOUT.orientation,
    margin: { ...DEFAULT_LAYOUT.margin, ...(p.margin ?? {}) },
    colors: { ...DEFAULT_LAYOUT.colors, ...(p.colors ?? {}) },
    typography: { ...DEFAULT_LAYOUT.typography, ...(p.typography ?? {}) },
    cover: { ...DEFAULT_LAYOUT.cover, ...(p.cover ?? {}) },
    header: { ...DEFAULT_LAYOUT.header, ...(p.header ?? {}) },
    productCard: { ...DEFAULT_LAYOUT.productCard, ...(p.productCard ?? {}) },
    footer: { ...DEFAULT_LAYOUT.footer, ...(p.footer ?? {}) },
    tableOfContents: { ...DEFAULT_LAYOUT.tableOfContents, ...(p.tableOfContents ?? {}) },
  };
};

/**
 * PDF page size -> pdfkit size string. pdfkit A4/A5/Letter built-in
 * kabul ediyor (lowercase'a cevirmesi yeterli).
 */
export const resolvePageSize = (layout: Required<PdfLayoutConfig>): string => {
  const size = layout.pageSize.toLowerCase();
  return size; // pdfkit native: 'a4', 'a5', 'letter'
};

/**
 * PDF orientation flag. pdfkit landscape true olarak kabul ediyor.
 */
export const resolveOrientation = (layout: Required<PdfLayoutConfig>): boolean => {
  return layout.orientation === 'landscape';
};
