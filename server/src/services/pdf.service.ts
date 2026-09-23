import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { getCatalog } from './catalog.service';
import { resolveTemplate } from './pdfTemplateResolver';
import { getCatalogPdfSettings } from './catalogPdfSettings.service';
import {
  renderCover,
  renderToc,
  renderHeader,
  renderProductCards,
  renderFooter,
} from './pdfRender';

/**
 * PDF service orchestrator (Faz 9 Aşama 3.2).
 *
 * Onceki implementasyon (commit 323f6a2) hardcoded render
 * logic iceriyordu. Refactor sonrasi bu dosya sadece:
 *   1) Katalog detayini al
 *   2) Template'i resolve et (DB'den veya default)
 *   3) catalog_pdf_settings'i oku (field toggles)
 *   4) PDF doc olustur + font yukle
 *   5) renderCover/renderToc/renderProductCards/renderHeader/renderFooter cagir
 *
 * Asıl render implementasyonu pdfRender.ts'te — varyantlar orada.
 */

export interface CatalogPdfOptions {
  productIds?: string[];
  includeCover?: boolean;
  includeToc?: boolean;
  /** Faz 9.3: template ID ile template-aware render. Yoksa default layout. */
  templateId?: string | null;
}

/**
 * Platform'a gore Turkce karakter destekleyen font path'i.
 * Windows: arial. Linux/macOS: fallback Helvetica (Turkce bozuk olabilir).
 */
const resolveFontPath = (): string | null => {
  if (process.platform === 'win32') {
    return 'C:\\Windows\\Fonts\\arial.ttf';
  }
  return null;
};

export const generateCatalogPdf = async (
  tenantId: string,
  catalogId: string,
  options: CatalogPdfOptions = {},
): Promise<Buffer> => {
  // 1) Katalog detayini al
  const detail = await getCatalog(tenantId, catalogId);
  if (!detail) throw new HttpError(404, 'Katalog bulunamadi');

  // 2) Template resolution (Faz 9.3.1)
  const resolved = await resolveTemplate(tenantId, options.templateId);
  const layout = resolved.layout;

  // 3) catalog_pdf_settings (field toggles: logo, telefon, email, ...)
  //    Faz 9.3.3'te route tarafindan da inject edilebilir, ama su an default'a dusuyor
  const settings = await getCatalogPdfSettings(tenantId, catalogId);

  // 4) PDF doc + font
  const doc = new PDFDocument({
    size: layout.pageSize.toLowerCase() as any,
    layout: layout.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin: layout.margin.top,
    info: {
      Title: detail.name,
      Author: 'DijiCatalog',
      CreationDate: new Date(),
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));
  });

  const fontPath = resolveFontPath();
  if (fontPath) {
    try {
      await fs.access(fontPath);
      doc.font(fontPath);
    } catch (err) {
      logger.warn({ fontPath, err: (err as Error).message }, 'PDF font yuklenemedi, Helvetica fallback');
      doc.font('Helvetica');
    }
  } else {
    doc.font('Helvetica');
  }

  // 5) Cover (opsiyonel)
  if (options.includeCover !== false) {
    await renderCover(doc, layout, detail, settings);
  }

  // 6) Item filtreleme (productIds verilmisse)
  const filteredItems = options.productIds && options.productIds.length > 0
    ? detail.items.filter((i) => options.productIds!.includes(i.id))
    : detail.items;

  // 7) TOC (opsiyonel)
  if (options.includeToc !== false) {
    renderToc(doc, layout, filteredItems, detail);
  }

  // 8) Product cards — header/footer her sayfa basinda/sonunda
  //    Page tracking: renderProductCards kendi icinde addPage cagirir.
  //    Total sayfa sayisi render sonrasi bufferedPageRange'ten okunur.
  await renderProductCards(doc, layout, filteredItems, settings);

  // 9) Footer'lari her sayfaya uygula (sayfa sayisi biliniyor)
  const pageRange = doc.bufferedPageRange();
  const totalPages = pageRange.count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(pageRange.start + i);
    // Cover ve TOC sayfalarinda footer gosterme (dokunus kalsin)
    const pageNum = i + 1;
    const isCover = options.includeCover !== false && pageNum === 1;
    const isToc = options.includeToc !== false && pageNum === (options.includeCover !== false ? 2 : 1);
    if (!isCover && !isToc) {
      renderFooter(doc, layout, detail, settings, pageNum, totalPages);
    }
  }

  doc.fillColor('#000000');
  doc.end();
  return finished;
};

/**
 * Tek urun PDF — henuz kullanilmiyor.
 */
export const generateProductPdf = async (
  _tenantId: string,
  _productId: string,
): Promise<Buffer> => {
  throw new HttpError(501, 'generateProductPdf henuz implement edilmedi (kullanilmiyor)');
};

/**
 * PDF stream — henuz kullanilmiyor.
 */
export const generatePdfStream = async (
  _tenantId: string,
  _catalogId: string,
): Promise<never> => {
  throw new HttpError(501, 'generatePdfStream henuz implement edilmedi (kullanilmiyor)');
};

logger.info('pdf.service.ts (template-aware orchestrator) yuklendi');
