import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import path from 'path';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { getCatalog } from './catalog.service';

/**
 * PDF service — katalog PDF uretimi (pdfkit).
 *
 * Faz 7 — Korgun ERP entegrasyonu sonrasi pdfkit implementasyonu.
 *
 * Endpoint'ler (server/src/routes/pdf.ts):
 * - POST /api/catalogs/:id/pdf/full       — tum katalog
 * - POST /api/catalogs/:id/pdf/selected   — secili urunler
 * - GET  /api/catalogs/:id/pdf/preview    — inline gosterim
 *
 * NOT: Turkce karakter icin Windows'ta C:\\Windows\\Fonts\\arial.ttf
 * kullanilir (tum Turkce karakter seti dahil). Linux'ta bulunamazsa
 * Helvetica fallback (Turkce karakterler bozuk gozukur ama sync calisir).
 */

export interface CatalogPdfOptions {
  productIds?: string[];
  includeCover?: boolean;
  includeToc?: boolean;
}

/**
 * Platform'a gore Turkce karakter destekleyen font path'i.
 * Windows: arial (en genis Turkce destegi).
 * Linux/macOS: bulamazsa fallback (PDF'te Turkce karakter bozuk olabilir).
 */
const resolveFontPath = (): string | null => {
  if (process.platform === 'win32') {
    return 'C:\\Windows\\Fonts\\arial.ttf';
  }
  return null; // Linux/macOS: fallback Helvetica (Turkce karakter bozuk)
};

export const generateCatalogPdf = async (
  tenantId: string,
  catalogId: string,
  options: CatalogPdfOptions = {},
): Promise<Buffer> => {
  // 1) Katalog detayini al (items + fieldConfig)
  const detail = await getCatalog(tenantId, catalogId);
  if (!detail) throw new HttpError(404, 'Katalog bulunamadi');

  // 2) PDF dokumani olustur
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: detail.name,
      Author: 'DijiCatalog',
      CreationDate: new Date(),
    },
  });

  // 3) Buffer'a topla (stream yakalama)
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));
  });

  // 4) Font yukle (Turkce karakter icin onemli)
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

  // 5) Cover sayfasi
  if (options.includeCover !== false) {
    doc.fontSize(28).text(detail.name, { align: 'center' });
    doc.moveDown(0.5);
    if (detail.description) {
      doc.fontSize(12).fillColor('#475569').text(detail.description, { align: 'center' });
    }
    doc.moveDown(2);
    doc.fontSize(14).fillColor('#0f172a').text(
      `${detail.items.length} urun  -  ${detail.customers.length} musteri`,
      { align: 'center' },
    );
    doc.moveDown(4);
    doc.fontSize(10).fillColor('#94a3b8').text(
      'DijiCatalog tarafindan olusturuldu  -  ' + new Date().toLocaleString('tr-TR'),
      { align: 'center' },
    );
    doc.fillColor('#0f172a');
  }

  // 6) Secili urunler filtresi (productIds verilmisse)
  const filteredItems = options.productIds && options.productIds.length > 0
    ? detail.items.filter((i) => options.productIds!.includes(i.id))
    : detail.items;

  // 7) Table of Contents (icerik)
  if (options.includeToc !== false && filteredItems.length > 0) {
    doc.addPage();
    doc.fontSize(18).fillColor('#0f172a').text('Icindekiler', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(11).fillColor('#475569');
    filteredItems.forEach((item, i) => {
      const p = item.product;
      const text = `${String(i + 1).padStart(2, '0')}  -  ${p.sku}  -  ${p.name}`;
      doc.text(text);
    });
    doc.fillColor('#0f172a');
  }

  // 8) Her urun icin sayfa
  for (let idx = 0; idx < filteredItems.length; idx++) {
    const item = filteredItems[idx];
    const p = item.product;

    doc.addPage();

    // 8a) Resim (varsa)
    const primaryImg = p.primaryImage ?? null;
    if (primaryImg?.base64Data) {
      try {
        const imgBuf = Buffer.from(primaryImg.base64Data, 'base64');
        const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.image(imgBuf, doc.page.margins.left, doc.page.margins.top, {
          fit: [pageW, 280],
          align: 'center',
          valign: 'center',
        });
        doc.y = doc.page.margins.top + 300;
      } catch (err) {
        logger.warn({ sku: p.sku, err: (err as Error).message }, 'PDF image embed failed');
        doc.y = doc.page.margins.top + 20;
      }
    } else {
      doc.y = doc.page.margins.top + 20;
    }

    // 8b) Baslik + SKU
    doc.fontSize(18).fillColor('#0f172a').text(p.name, { width: 500 });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#64748b').text(`SKU: ${p.sku}`);

    if (p.category) {
      doc.fontSize(10).fillColor('#475569').text(`Kategori: ${p.category.name}`);
    }

    doc.moveDown(0.5);

    // 8c) Fiyat (customPrice varsa onu kullan)
    const finalPrice = item.customPrice ?? p.price;
    doc.fontSize(20).fillColor('#16a34a').text(
      `${finalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${p.currency}`,
    );
    if (item.customPrice && item.customPrice !== p.price) {
      doc.fontSize(9).fillColor('#94a3b8').text(`Liste: ${p.price.toLocaleString('tr-TR')} ${p.currency}`);
    }

    doc.moveDown(0.5);

    // 8d) Aciklama
    if (p.description) {
      doc.fontSize(10).fillColor('#334155').text(p.description, { width: 500 });
      doc.moveDown(0.5);
    }

    // 8e) Marka + Birim
    if (p.brand) {
      doc.fontSize(10).fillColor('#475569').text(`Marka: ${p.brand}`);
    }
    if (p.unit) {
      doc.fontSize(10).fillColor('#475569').text(`Birim: ${p.unit}`);
    }

    // 8f) Musteri notu (catalog item.customNotes)
    if (item.customNotes) {
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#7c3aed').text(`Not: ${item.customNotes}`);
    }

    // 8g) Sayfa numarasi
    doc.fontSize(8).fillColor('#cbd5e1').text(
      `${idx + 1} / ${filteredItems.length}`,
      doc.page.margins.left,
      doc.page.height - 30,
      { width: 500, align: 'center' },
    );
  }

  doc.fillColor('#0f172a');
  doc.end();
  return finished;
};

/**
 * Tek urun PDF — Faz 7'de kullanilmadi, sadece stub.
 * generateCatalogPdf ile benzer mantik (tek sayfa).
 */
export const generateProductPdf = async (
  tenantId: string,
  productId: string,
): Promise<Buffer> => {
  throw new HttpError(501, 'generateProductPdf henuz implement edilmedi (kullanilmiyor)');
};

/**
 * PDF stream — henuz kullanilmadi. Inline preview ileride bunu kullanabilir.
 */
export const generatePdfStream = async (
  _tenantId: string,
  _catalogId: string,
): Promise<never> => {
  throw new HttpError(501, 'generatePdfStream henuz implement edilmedi (kullanilmiyor)');
};

logger.info('pdf.service.ts (pdfkit implementasyonu) yuklendi');