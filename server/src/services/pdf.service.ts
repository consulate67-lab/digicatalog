import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../config/database';
import {
  catalogs,
  catalogItems,
  catalogCustomers,
  catalogFieldConfig,
  products,
  productImages,
  categories,
  customers,
  type CatalogFieldName,
} from '../db/schema';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * PDF üretim servisi. Server-side, pdfkit tabanlı.
 *
 * Avantaj: Railway'de native dep gerektirmez (puppeteer gibi
 * Chromium'a bağımlı değil), hızlı, hafif.
 *
 * Yapı:
 * 1) Kapak sayfası: katalog adı, açıklama, müşteri listesi, tarih
 * 2) İçindekiler: kategori listesi + sayfa numarası (basit)
 * 3) Kategori bölümleri: her kategori için ayrı bölüm başlığı
 * 4) Ürün sayfaları: 2 sütun grid, ürün başına resim + isim + fiyat
 *    + notlar, field config'e göre
 *
 * Custom override'lar: customPrice/customNotes viewer ile aynı
 * mantıkla uygulanır.
 */

interface ProductForPdf {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  brand: string | null;
  unit: string | null;
  notes: string | null;
  category: { id: string; name: string; slug: string } | null;
  images: Array<{ base64Data: string; mimeType: string; isPrimary: boolean }>;
  customPrice: number | null;
  customNotes: string | null;
}

interface PdfOptions {
  /** Belirli ürünler (undefined = tüm katalog) */
  productIds?: string[];
  /** Include cover page */
  includeCover?: boolean;
  /** Include TOC */
  includeToc?: boolean;
}

const PAGE_WIDTH = 595; // A4 portrait
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const PRODUCT_CARD_W = (CONTENT_WIDTH - 16) / 2; // 2 sütun
const PRODUCT_CARD_H = 200;
const PRODUCT_IMG_H = 100;

export const generateCatalogPdf = async (
  tenantId: string,
  catalogId: string,
  options: PdfOptions = {},
): Promise<Buffer> => {
  // === Veriyi çek ===
  const [catalog] = await db
    .select()
    .from(catalogs)
    .where(and(eq(catalogs.id, catalogId), withTenantCatalogs(catalogs, tenantId)))
    .limit(1);
  if (!catalog) throw new HttpError(404, 'Katalog bulunamadı');
  if (catalog.status !== 'active') {
    // Taslak/arşiv de export edilebilir (admin kendi içinde görmek isteyebilir)
    // ama viewer'dan gizli. Şimdilik aktiflik kontrolü yok.
  }

  // Items
  const itemsQuery = db
    .select({
      item: catalogItems,
      product: products,
      category: { id: categories.id, name: categories.name, slug: categories.slug },
    })
    .from(catalogItems)
    .innerJoin(products, eq(catalogItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(catalogItems.catalogId, catalogId))
    .orderBy(asc(catalogItems.sortOrder), asc(catalogItems.createdAt));

  let itemRows = await itemsQuery;
  if (options.productIds && options.productIds.length > 0) {
    const idSet = new Set(options.productIds);
    itemRows = itemRows.filter((r) => idSet.has(r.item.productId));
  }
  if (itemRows.length === 0) {
    throw new HttpError(400, 'Katalogta ürün yok veya seçili ürünler katalogda bulunamadı');
  }

  // Resimler
  const productIds = itemRows.map((r) => r.product.id);
  const imageMap = new Map<string, Array<{ base64Data: string; mimeType: string; isPrimary: boolean }>>();
  if (productIds.length > 0) {
    const images = await db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.sortOrder));
    for (const img of images) {
      const list = imageMap.get(img.productId) ?? [];
      list.push({ base64Data: img.base64Data, mimeType: img.mimeType, isPrimary: img.isPrimary });
      imageMap.set(img.productId, list);
    }
  }

  // Müşteriler
  const customerRows = await db
    .select({ customer: customers })
    .from(catalogCustomers)
    .innerJoin(customers, eq(catalogCustomers.customerId, customers.id))
    .where(eq(catalogCustomers.catalogId, catalogId))
    .orderBy(asc(customers.name));

  // Field config
  const fieldConfigRows = await db
    .select()
    .from(catalogFieldConfig)
    .where(eq(catalogFieldConfig.catalogId, catalogId))
    .orderBy(asc(catalogFieldConfig.sortOrder));

  const isVisible = (name: CatalogFieldName): boolean => {
    const f = fieldConfigRows.find((c) => c.fieldName === name);
    return f ? f.isVisible : true;
  };

  // === Products shape (custom override uygulanmış) ===
  const productsForPdf: ProductForPdf[] = itemRows.map((r) => {
    const imgs = imageMap.get(r.product.id) ?? [];
    const primary = imgs.find((i) => i.isPrimary) ?? imgs[0] ?? null;
    return {
      id: r.product.id,
      sku: r.product.sku,
      name: r.product.name,
      description: r.product.description,
      price: r.item.customPrice !== null ? Number(r.item.customPrice) : Number(r.product.price),
      currency: r.product.currency,
      brand: r.product.brand,
      unit: r.product.unit,
      notes: r.item.customNotes ?? r.product.notes,
      category: r.category?.id ? { id: r.category.id, name: r.category.name, slug: r.category.slug } : null,
      images: primary ? [primary] : [], // PDF'te sadece primary resim (boyut sınırı)
      customPrice: r.item.customPrice !== null ? Number(r.item.customPrice) : null,
      customNotes: r.item.customNotes,
    };
  });

  // === PDF oluştur ===
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        info: {
          Title: catalog.name,
          Author: 'DijiCatalog',
          Subject: catalog.description ?? undefined,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const includeCover = options.includeCover !== false;
      const includeToc = options.includeToc !== false;

      // === Kapak ===
      if (includeCover) {
        drawCoverPage(doc, catalog.name, catalog.description, customerRows.map((r) => r.customer));
        doc.addPage();
      }

      // === İçindekiler ===
      if (includeToc) {
        drawTocPage(doc, productsForPdf);
        doc.addPage();
      }

      // === Ürün sayfaları (kategori bazlı) ===
      drawProducts(doc, productsForPdf, isVisible);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// === Helper: tenant izolasyonu ===
import { withTenant as withTenantHelper } from '../db/helpers';
const withTenantCatalogs = withTenantHelper;

// === Drawing helpers ===

const drawCoverPage = (
  doc: PDFKit.PDFDocument,
  name: string,
  description: string | null,
  customerList: Array<{ name: string; contactName: string | null; email: string | null; phone: string | null }>,
) => {
  // Üst kısım: başlık
  doc.fontSize(32).font('Helvetica-Bold').text(name, MARGIN, 120, {
    width: CONTENT_WIDTH,
    align: 'center',
  });

  if (description) {
    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica').fillColor('#475569').text(description, MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  }

  // Ayırıcı
  doc.moveDown(2);
  const lineY = doc.y;
  doc
    .moveTo(MARGIN + 100, lineY)
    .lineTo(PAGE_WIDTH - MARGIN - 100, lineY)
    .strokeColor('#cbd5e1')
    .lineWidth(1)
    .stroke();

  // Tarih
  doc.moveDown(2);
  doc.fontSize(11).fillColor('#64748b').text(
    new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }),
    MARGIN,
    doc.y,
    { width: CONTENT_WIDTH, align: 'center' },
  );

  // Müşteri listesi
  if (customerList.length > 0) {
    doc.moveDown(2);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('Müşteriler', MARGIN, doc.y);
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#334155');
    for (const c of customerList.slice(0, 20)) {
      const line = c.name + (c.contactName ? ` — ${c.contactName}` : '');
      doc.text(line, MARGIN, doc.y);
    }
    if (customerList.length > 20) {
      doc.fillColor('#94a3b8').text(`... ve ${customerList.length - 20} müşteri daha`, MARGIN, doc.y);
    }
  }

  // Footer (sayfa numarası)
  drawFooter(doc, 1);
};

const drawTocPage = (doc: PDFKit.PDFDocument, products: ProductForPdf[]) => {
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#0f172a').text('İçindekiler', MARGIN, MARGIN);
  doc.moveDown(1);

  // Kategori bazlı grupla
  const byCategory = new Map<string, ProductForPdf[]>();
  for (const p of products) {
    const key = p.category?.id ?? '__none__';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(p);
  }

  doc.fontSize(11).font('Helvetica').fillColor('#334155');
  for (const [, prods] of byCategory) {
    const catName = prods[0].category?.name ?? 'Kategorisiz';
    doc.font('Helvetica-Bold').text(catName, MARGIN, doc.y);
    doc.font('Helvetica').fillColor('#64748b');
    for (const p of prods.slice(0, 30)) {
      doc.text(`  • ${p.name}`, MARGIN + 16, doc.y);
    }
    if (prods.length > 30) {
      doc.fillColor('#94a3b8').text(`  ... ve ${prods.length - 30} ürün daha`, MARGIN + 16, doc.y);
    }
    doc.moveDown(0.5);
    doc.fillColor('#334155');
  }
};

const drawProducts = (
  doc: PDFKit.PDFDocument,
  products: ProductForPdf[],
  isVisible: (name: CatalogFieldName) => boolean,
) => {
  // Kategori bazlı grupla
  const byCategory = new Map<string, ProductForPdf[]>();
  for (const p of products) {
    const key = p.category?.id ?? '__none__';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(p);
  }

  let pageNum = doc.bufferedPageRange().count;
  for (const [, prods] of byCategory) {
    const catName = prods[0].category?.name ?? 'Kategorisiz';
    // Kategori başlık sayfası
    doc.addPage();
    pageNum++;
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#0f172a').text(catName, MARGIN, MARGIN);
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`${prods.length} ürün`, MARGIN, doc.y + 4);
    doc.moveDown(1);

    // Ürün kartları (2 sütun grid)
    let y = doc.y;
    let x = MARGIN;
    let col = 0;

    for (const p of prods) {
      // Sayfa sonu kontrolü
      if (y + PRODUCT_CARD_H > PAGE_HEIGHT - MARGIN - 30) {
        drawFooter(doc, pageNum);
        doc.addPage();
        pageNum++;
        y = MARGIN;
        x = MARGIN;
        col = 0;
      }

      drawProductCard(doc, p, x, y, PRODUCT_CARD_W, PRODUCT_CARD_H, isVisible);

      col++;
      if (col % 2 === 0) {
        x = MARGIN;
        y += PRODUCT_CARD_H + 12;
      } else {
        x = MARGIN + PRODUCT_CARD_W + 16;
      }
    }

    drawFooter(doc, pageNum);
  }
};

const drawProductCard = (
  doc: PDFKit.PDFDocument,
  p: ProductForPdf,
  x: number,
  y: number,
  w: number,
  h: number,
  isVisible: (name: CatalogFieldName) => boolean,
) => {
  // Card border
  doc.save();
  doc.rect(x, y, w, h).strokeColor('#e2e8f0').lineWidth(1).stroke();

  // Image (varsa)
  const img = p.images[0];
  const imgW = w;
  const imgH = PRODUCT_IMG_H;
  if (img) {
    try {
      const data = img.base64Data.startsWith('data:')
        ? img.base64Data
        : `data:${img.mimeType};base64,${img.base64Data}`;
      doc.image(data, x, y, { width: imgW, height: imgH, fit: [imgW, imgH], align: 'center', valign: 'center' });
    } catch {
      // Image failed, placeholder
      doc.rect(x, y, imgW, imgH).fillColor('#f1f5f9').fill();
    }
  } else {
    doc.rect(x, y, imgW, imgH).fillColor('#f1f5f9').fill();
  }

  // Text area
  const textX = x + 8;
  let textY = y + imgH + 8;
  const textW = w - 16;

  // İsim
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(p.name, textX, textY, {
    width: textW,
    height: 30,
    ellipsis: true,
  });
  textY = doc.y + 2;

  // SKU
  if (isVisible('sku')) {
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(p.sku, textX, textY, { width: textW });
    textY = doc.y + 2;
  }

  // Brand
  if (isVisible('brand') && p.brand) {
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`Marka: ${p.brand}`, textX, textY, { width: textW });
    textY = doc.y + 2;
  }

  // Price
  if (isVisible('price')) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(
      `${p.price.toLocaleString('tr-TR')} ${isVisible('currency') ? p.currency : ''}`.trim(),
      textX,
      textY,
      { width: textW },
    );
    textY = doc.y + 2;
  }

  // Notes (kısa)
  if (isVisible('notes') && p.notes && textY < y + h - 20) {
    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(
      p.notes.substring(0, 80) + (p.notes.length > 80 ? '...' : ''),
      textX,
      textY,
      { width: textW, height: y + h - textY - 8, ellipsis: true },
    );
  }

  doc.restore();
};

const drawFooter = (doc: PDFKit.PDFDocument, pageNum: number) => {
  const y = PAGE_HEIGHT - MARGIN + 10;
  doc.save();
  doc.font('Helvetica').fontSize(8).fillColor('#94a3b8');
  doc.text(`DijiCatalog · Sayfa ${pageNum}`, MARGIN, y, {
    width: CONTENT_WIDTH,
    align: 'center',
  });
  doc.restore();
};

// Dışa akış için stream versiyonu (ileride download endpoint'inde kullanılabilir)
export const generateCatalogPdfStream = async (
  tenantId: string,
  catalogId: string,
  options: PdfOptions = {},
): Promise<Readable> => {
  const buffer = await generateCatalogPdf(tenantId, catalogId, options);
  return Readable.from(buffer);
};

logger.info({}, 'PDF service module loaded');
