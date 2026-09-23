import PDFDocument from 'pdfkit';
import { logger } from '../utils/logger';
import type { CatalogDetailDTO } from './catalog.service';
import type { CatalogPdfSettingsDTO } from './catalogPdfSettings.service';

/**
 * PDF render helpers (Faz 9 Aşama 3.2).
 *
 * pdf.service.ts'in generateCatalogPdf()'i sadece orchestrator — asil
 * render islemi burada 5 export fonksiyona parcalanmis:
 *   - renderCover(doc, layout, detail, settings)
 *   - renderHeader(doc, layout, detail, settings)
 *   - renderProductCards(doc, layout, items, settings)
 *   - renderToc(doc, layout, items, detail)
 *   - renderFooter(doc, layout, detail, settings, currentPage, totalPages)
 *
 * Butun fonksiyonlar doc'un mevcut cursor pozisyonundan itibaren
 * render eder. Cover ve TOC doc.addPage() cagirir; header/footer
 * her sayfa basinda/sonunda doc.on('pageAdded') ile veya direkt
 * doc.addPage sonrasi cagirilir.
 *
 * Layout (Required<PdfLayoutConfig>) her yerden DEFAULT_LAYOUT ile
 * merge edilmis sekilde gelir (pdfTemplateResolver'dan).
 */

// === Helpers ===

const hexToPdfkitColor = (hex: string): string => hex; // pdfkit hex kabul ediyor

const imageAspectHeight = (width: number, ratio: string): number => {
  switch (ratio) {
    case '1:1': return width;
    case '4:3': return width * 3 / 4;
    case '3:2': return width * 2 / 3;
    case '16:9': return width * 9 / 16;
    default: return width * 3 / 4;
  }
};

const applyTextStyle = (
  doc: PDFKit.PDFDocument,
  layout: any,
  kind: 'title' | 'body' | 'caption',
): void => {
  const t = layout.typography;
  doc.fontSize(kind === 'title' ? t.titleSize : kind === 'body' ? t.bodySize : t.captionSize);
  doc.fillColor(layout.colors.text);
};

const applyAccentColor = (doc: PDFKit.PDFDocument, layout: any): void => {
  doc.fillColor(layout.colors.accent);
};

const applyMutedColor = (doc: PDFKit.PDFDocument, layout: any): void => {
  doc.fillColor(layout.colors.muted);
};

// === COVER ===

export const renderCover = async (
  doc: PDFKit.PDFDocument,
  layout: any,
  detail: CatalogDetailDTO,
  settings: CatalogPdfSettingsDTO | null,
): Promise<void> => {
  doc.addPage();
  const style = layout.cover.style;
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageH = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

  switch (style) {
    case 'minimal': {
      // Ortada baslik + description + count + timestamp
      doc.fillColor(layout.colors.background).rect(0, 0, doc.page.width, doc.page.height).fill();
      doc.fillColor(layout.colors.text);
      const titleText = settings?.customCoverTitle ?? detail.name;
      doc.fontSize(layout.typography.titleSize * 1.4).fillColor(layout.colors.primary)
        .text(titleText, { align: 'center', width: pageW });
      doc.moveDown(0.5);
      if (detail.description) {
        doc.fontSize(layout.typography.bodySize).fillColor(layout.colors.secondary)
          .text(detail.description, { align: 'center', width: pageW });
      }
      doc.moveDown(2);
      doc.fontSize(layout.typography.bodySize + 2).fillColor(layout.colors.text)
        .text(`${detail.items.length} urun  -  ${detail.customers.length} musteri`, { align: 'center' });
      doc.moveDown(4);
      doc.fontSize(layout.typography.captionSize).fillColor(layout.colors.muted)
        .text('DijiCatalog tarafindan olusturuldu  -  ' + new Date().toLocaleString('tr-TR'), { align: 'center' });
      break;
    }

    case 'centered': {
      doc.fillColor(layout.colors.background).rect(0, 0, doc.page.width, doc.page.height).fill();
      // Ortada border box
      const boxW = pageW * 0.7;
      const boxH = pageH * 0.5;
      const boxX = (doc.page.width - boxW) / 2;
      const boxY = (doc.page.height - boxH) / 2;
      doc.lineWidth(1).strokeColor(layout.colors.accent)
        .rect(boxX, boxY, boxW, boxH).stroke();
      // Text icinde
      doc.fillColor(layout.colors.text);
      const titleText = settings?.customCoverTitle ?? detail.name;
      doc.fontSize(layout.typography.titleSize * 1.2).fillColor(layout.colors.primary)
        .text(titleText, boxX, boxY + boxH * 0.3, { width: boxW, align: 'center' });
      doc.fontSize(layout.typography.bodySize).fillColor(layout.colors.secondary)
        .text(`${detail.items.length} urun  -  ${detail.customers.length} musteri`,
          boxX, boxY + boxH * 0.55, { width: boxW, align: 'center' });
      doc.fontSize(layout.typography.captionSize).fillColor(layout.colors.muted)
        .text(new Date().toLocaleString('tr-TR'),
          boxX, boxY + boxH * 0.7, { width: boxW, align: 'center' });
      break;
    }

    case 'full-image': {
      // Ilk urunun image'i kapak (varsa). Yoksa gradient fallback.
      const coverItem = detail.items[0];
      const primaryImg = coverItem?.product.primaryImage ?? null;
      const overlay = layout.cover.overlayOpacity ?? 0.5;
      if (primaryImg?.base64Data) {
        try {
          const imgBuf = Buffer.from(primaryImg.base64Data, 'base64');
          doc.image(imgBuf, 0, 0, { width: doc.page.width, height: doc.page.height });
          // Overlay (koyu yarı saydam)
          doc.fillOpacity(overlay).fillColor('#000000')
            .rect(0, 0, doc.page.width, doc.page.height).fill();
          doc.fillOpacity(1);
          // Title ortada
          doc.fillColor('#FFFFFF').fontSize(layout.typography.titleSize * 1.5)
            .text(settings?.customCoverTitle ?? detail.name, 0, doc.page.height / 2 - 40,
              { width: doc.page.width, align: 'center' });
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'Cover full-image failed');
        }
      } else {
        // Fallback: colored bg + title
        doc.fillColor(layout.colors.primary).rect(0, 0, doc.page.width, doc.page.height).fill();
        doc.fillColor('#FFFFFF').fontSize(layout.typography.titleSize * 1.5)
          .text(settings?.customCoverTitle ?? detail.name, 0, doc.page.height / 2 - 40,
            { width: doc.page.width, align: 'center' });
      }
      break;
    }

    case 'magazine': {
      // Sol yari: text, sag yari: image (ilk urunun)
      doc.fillColor(layout.colors.background).rect(0, 0, doc.page.width, doc.page.height).fill();
      const halfW = doc.page.width / 2;
      // Sol text
      doc.fillColor(layout.colors.primary).fontSize(layout.typography.titleSize * 1.3)
        .text(settings?.customCoverTitle ?? detail.name, doc.page.margins.left,
          doc.page.height / 2 - 60, { width: halfW - doc.page.margins.left, align: 'left' });
      doc.fillColor(layout.colors.secondary).fontSize(layout.typography.bodySize + 2)
        .text(`${detail.items.length} urun katalog`,
          doc.page.margins.left, doc.page.height / 2 + 20, { width: halfW - doc.page.margins.left });
      // Sag image
      const coverItem = detail.items[0];
      const primaryImg = coverItem?.product.primaryImage ?? null;
      if (primaryImg?.base64Data) {
        try {
          const imgBuf = Buffer.from(primaryImg.base64Data, 'base64');
          doc.image(imgBuf, halfW, 0, {
            width: halfW, height: doc.page.height,
            fit: [halfW, doc.page.height], align: 'center', valign: 'center',
          });
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'Cover magazine image failed');
        }
      } else {
        doc.fillColor(layout.colors.muted).rect(halfW, 0, halfW, doc.page.height).fill();
      }
      break;
    }

    case 'gradient': {
      // Gradient bg + title ortada
      // pdfkit gradient yok — solid accent color + line accent kullaniyoruz.
      doc.fillColor(layout.colors.primary).rect(0, 0, doc.page.width, doc.page.height).fill();
      // Accent stripe ortada
      doc.fillColor(layout.colors.accent).rect(0, doc.page.height / 2 - 2, doc.page.width, 4).fill();
      // Title ortada beyaz
      doc.fillColor(layout.colors.background).fontSize(layout.typography.titleSize * 1.5)
        .text(settings?.customCoverTitle ?? detail.name, 0, doc.page.height / 2 - 50,
          { width: doc.page.width, align: 'center' });
      doc.fillColor(layout.colors.muted).fontSize(layout.typography.bodySize + 2)
        .text(`${detail.items.length} urun  -  ${detail.customers.length} musteri`,
          0, doc.page.height / 2 + 20, { width: doc.page.width, align: 'center' });
      break;
    }
  }
};

// === HEADER (her sayfa basinda) ===

export const renderHeader = (
  doc: PDFKit.PDFDocument,
  layout: any,
  detail: CatalogDetailDTO,
  settings: CatalogPdfSettingsDTO | null,
): void => {
  const style = layout.header.style;
  if (style === 'none') return;

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const y = doc.page.margins.top - 25; // margin ustune header

  doc.fontSize(layout.typography.captionSize);

  if (style === 'simple') {
    doc.fillColor(layout.colors.secondary);
    if (settings?.showLogo !== false) {
      doc.text('DijiCatalog', x, y);
    }
    if (settings?.showWebsite !== false) {
      doc.text('DijiCatalog.local', x, y, { width: pageW, align: 'right' });
    }
  } else if (style === 'bold') {
    // Accent stripe
    doc.fillColor(layout.colors.accent).rect(x, y + 18, 30, 3).fill();
    doc.fillColor(layout.colors.primary).fontSize(layout.typography.bodySize + 1)
      .text(settings?.showLogo !== false ? 'DijiCatalog' : '', x, y - 5);
    if (settings?.showWebsite !== false) {
      doc.fillColor(layout.colors.secondary).fontSize(layout.typography.captionSize)
        .text(new Date().toLocaleDateString('tr-TR'), x, y, { width: pageW, align: 'right' });
    }
  } else if (style === 'minimal') {
    doc.fillColor(layout.colors.muted);
    if (settings?.showWebsite !== false) {
      doc.text('DijiCatalog', x, y, { width: pageW, align: 'right' });
    }
  }

  doc.fillColor(layout.colors.text); // reset
};

// === TABLE OF CONTENTS ===

export const renderToc = (
  doc: PDFKit.PDFDocument,
  layout: any,
  items: CatalogDetailDTO['items'],
  detail: CatalogDetailDTO,
): void => {
  if (!layout.tableOfContents.enabled || items.length === 0) return;

  doc.addPage();
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.fontSize(layout.typography.titleSize).fillColor(layout.colors.primary)
    .text('Icindekiler', { align: 'center', width: pageW });
  doc.moveDown(1);

  if (layout.tableOfContents.groupByCategory) {
    // Kategoriye gore grupla
    const grouped: Record<string, typeof items> = {};
    for (const it of items) {
      const catName = it.product.category?.name ?? 'Diger';
      (grouped[catName] ??= []).push(it);
    }
    for (const [cat, list] of Object.entries(grouped)) {
      doc.fontSize(layout.typography.bodySize + 2).fillColor(layout.colors.accent)
        .text(cat, { continued: false });
      doc.moveDown(0.3);
      list.forEach((item, i) => {
        doc.fontSize(layout.typography.bodySize).fillColor(layout.colors.text)
          .text(`${String(i + 1).padStart(2, '0')}  -  ${item.product.sku}  -  ${item.product.name}`,
            { indent: 10 });
      });
      doc.moveDown(0.5);
    }
  } else if (layout.tableOfContents.style === 'numbered') {
    items.forEach((item, i) => {
      doc.fontSize(layout.typography.bodySize).fillColor(layout.colors.text)
        .text(`${String(i + 1).padStart(3, '0')}    ${item.product.sku}    ${item.product.name}`,
          { width: pageW });
    });
  } else {
    // simple (default)
    items.forEach((item, i) => {
      doc.fontSize(layout.typography.bodySize).fillColor(layout.colors.text)
        .text(`${String(i + 1).padStart(2, '0')}  -  ${item.product.sku}  -  ${item.product.name}`,
          { width: pageW });
    });
  }
  doc.fillColor(layout.colors.text); // reset
};

// === PRODUCT CARDS ===

interface PageContext {
  items: CatalogDetailDTO['items'];
  pageSize: number;
  cursorY: number;
  layout: any;
  settings: CatalogPdfSettingsDTO | null;
}

/**
 * Product card render — columns × imagePosition'a gore.
 *
 * columns=1: her urun tek sayfa (eski davranis)
 * columns=2/3/4: sayfaya grid olarak yerlestirir, satir dolunca
 *   addPage ile yeni sayfa. imagePosition'a gore layout degisir:
 *   - top: image ust, text alt
 *   - left: image sol, text sag
 *   - right: image sag, text sol
 *   - background: full-bleed image, text overlay
 */
export const renderProductCards = async (
  doc: PDFKit.PDFDocument,
  layout: any,
  items: CatalogDetailDTO['items'],
  settings: CatalogPdfSettingsDTO | null,
): Promise<void> => {
  const cols = layout.productCard.columns;
  const imagePos = layout.productCard.imagePosition;
  const cardStyle = layout.productCard.style;
  const showSku = layout.productCard.showSku;
  const showDesc = layout.productCard.showDescription;
  const showCat = layout.productCard.showCategory;
  const showBrand = layout.productCard.showBrand;
  const showPrice = layout.productCard.showPrice;
  const aspect = layout.productCard.imageAspectRatio;
  const border = layout.productCard.borderStyle;

  // Faz 10.2: productsPerPage override (catalog-level setting).
  // Set edilmis ve cols'a tam bolunmuyorsa, son satir eksik kalabilir
  // (kullanici kasitli olarak secti — render'a mudahale etmiyoruz).
  const perPageOverride = layout.productsPerPageOverride as number | undefined;
  const maxItemsPerPage = perPageOverride ?? Infinity;
  let itemsOnCurrentPage = 0;

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colGap = 12;
  const cellW = (pageW - colGap * (cols - 1)) / cols;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let col = i % cols;
    const x = doc.page.margins.left + col * (cellW + colGap);

    // Faz 10.2: productsPerPage override — sayfa basina max urun sayisi.
    // Sayfa basinda degilsek ve limit asildiysa, satir sonu olmasa bile
    // yeni sayfa acariz. Layout bozulmamasi icin col=0 muamelesi yapiyoruz.
    const hitPerPageLimit = itemsOnCurrentPage >= maxItemsPerPage;
    if (col === 0 || hitPerPageLimit) {
      doc.addPage();
      renderHeader(doc, layout, { name: '', id: '', tenantId: '', description: null, status: 'active',
        createdBy: null, createdAt: '', updatedAt: '', items: [], customers: [], fieldConfig: [] },
        settings);
      doc.y = doc.page.margins.top + 10;
      itemsOnCurrentPage = 0;
      col = 0; // yeni sayfada her zaman col=0
    }

    const startY = doc.y;
    const itemHeight = await renderOneProductCard(doc, layout, item, {
      x, y: startY, width: cellW, aspect, imagePos, showSku, showDesc, showCat, showBrand, showPrice, border,
    });

    itemsOnCurrentPage++;

    // Cursor'u ilerlet
    if (col === cols - 1) {
      doc.y = startY + itemHeight + 15;
    } else {
      // Yan yana: diger kolonu da ayni satirda baslatmak icin
      // doc.y ayni satirda kalir; bir sonraki item col+1 olacak
      // Eger son item cols-1 degilse, satir sonunu zorla
      // Burada doc.y'yi satir sonunda tutmaliyiz
      if (i + 1 === items.length) {
        doc.y = startY + itemHeight + 15;
      } else {
        doc.y = Math.max(doc.y, startY + itemHeight);
      }
    }
  }
};

interface CardRenderOptions {
  x: number;
  y: number;
  width: number;
  aspect: string;
  imagePos: 'top' | 'left' | 'right' | 'background';
  showSku: boolean;
  showDesc: boolean;
  showCat: boolean;
  showBrand: boolean;
  showPrice: boolean;
  border: 'none' | 'thin' | 'accent' | 'shadow';
}

const renderOneProductCard = async (
  doc: PDFKit.PDFDocument,
  layout: any,
  item: CatalogDetailDTO['items'][number],
  opts: CardRenderOptions,
): Promise<number> => {
  const { x, y, width, aspect, imagePos, showSku, showDesc, showCat, showBrand, showPrice, border } = opts;
  const p = item.product;
  const primaryImg = p.primaryImage ?? null;
  const imgW = imagePos === 'left' || imagePos === 'right' ? width * 0.4 : width;
  const imgH = imageAspectHeight(imgW, aspect);
  let totalHeight = 0;

  // Border / background (background imagePos ise skip)
  if (border !== 'none' && imagePos !== 'background') {
    const pad = border === 'shadow' ? 4 : 2;
    if (border === 'shadow') {
      doc.fillColor('#E2E8F0').rect(x + 2, y + 2, width, imgH + 70).fill();
    }
    doc.lineWidth(border === 'accent' ? 2 : 0.5).strokeColor(border === 'accent' ? layout.colors.accent : layout.colors.muted)
      .rect(x, y, width, imgH + 70).stroke();
  }

  // Image
  let imageBottom = y;
  if (primaryImg?.base64Data && imagePos !== 'background') {
    try {
      const imgBuf = Buffer.from(primaryImg.base64Data, 'base64');
      if (imagePos === 'left' || imagePos === 'right') {
        const imgX = imagePos === 'left' ? x : x + width - imgW;
        doc.image(imgBuf, imgX, y, { width: imgW, height: imgH });
        imageBottom = y + imgH;
      } else {
        doc.image(imgBuf, x, y, { width, height: imgH });
        imageBottom = y + imgH;
      }
    } catch (err) {
      logger.warn({ sku: p.sku, err: (err as Error).message }, 'PDF image embed failed');
      imageBottom = y + 20;
    }
  } else if (primaryImg?.base64Data && imagePos === 'background') {
    // Full-bleed background
    try {
      const imgBuf = Buffer.from(primaryImg.base64Data, 'base64');
      doc.image(imgBuf, x, y, { width, height: imgH + 60 });
      // Dark overlay for text readability
      doc.fillOpacity(0.4).fillColor('#000000')
        .rect(x, y, width, imgH + 60).fill();
      doc.fillOpacity(1);
    } catch (err) {
      logger.warn({ sku: p.sku, err: (err as Error).message }, 'PDF bg image failed');
    }
    imageBottom = y;
  } else {
    // Placeholder box
    doc.fillColor(layout.colors.muted).rect(x, y, imgW, imgH).fill();
    doc.fillColor('#FFFFFF').fontSize(10).text('Resim yok', x, y + imgH / 2 - 5, { width: imgW, align: 'center' });
    imageBottom = y + imgH;
  }

  // Text alani
  const textX = imagePos === 'left' ? x + imgW + 6 : imagePos === 'right' ? x : x;
  const textW = imagePos === 'left' || imagePos === 'right' ? width - imgW - 6 : width;
  let textY = imagePos === 'top' ? imageBottom + 6 : (imagePos === 'left' || imagePos === 'right' ? y : y + 6);
  const isBackground = imagePos === 'background';

  if (isBackground) {
    doc.fillColor('#FFFFFF');
  } else {
    doc.fillColor(layout.colors.text);
  }

  // Name
  doc.fontSize(layout.typography.bodySize + 3);
  doc.text(p.name, textX, textY, { width: textW });
  textY = doc.y + 2;

  // SKU
  if (showSku) {
    doc.fontSize(layout.typography.captionSize);
    if (isBackground) doc.fillColor('#FFFFFF');
    else doc.fillColor(layout.colors.muted);
    doc.text(`SKU: ${p.sku}`, textX, textY, { width: textW });
    textY = doc.y + 2;
  }

  // Category
  if (showCat && p.category) {
    doc.fontSize(layout.typography.captionSize);
    if (isBackground) doc.fillColor('#FFFFFF');
    else doc.fillColor(layout.colors.secondary);
    doc.text(`Kategori: ${p.category.name}`, textX, textY, { width: textW });
    textY = doc.y + 2;
  }

  // Brand
  if (showBrand && p.brand) {
    doc.fontSize(layout.typography.captionSize);
    if (isBackground) doc.fillColor('#FFFFFF');
    else doc.fillColor(layout.colors.secondary);
    doc.text(`Marka: ${p.brand}`, textX, textY, { width: textW });
    textY = doc.y + 2;
  }

  // Price
  if (showPrice) {
    const finalPrice = item.customPrice ?? p.price;
    doc.fontSize(layout.typography.bodySize + 4);
    if (isBackground) doc.fillColor('#FFFFFF');
    else doc.fillColor(layout.colors.accent);
    doc.text(`${finalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${p.currency}`,
      textX, textY, { width: textW });
    textY = doc.y + 2;
  }

  // Description
  if (showDesc && p.description) {
    doc.fontSize(layout.typography.captionSize);
    if (isBackground) doc.fillColor('#FFFFFF');
    else doc.fillColor(layout.colors.secondary);
    doc.text(p.description, textX, textY, { width: textW });
    textY = doc.y + 2;
  }

  // customNotes
  if (item.customNotes) {
    doc.fontSize(layout.typography.captionSize).fillColor('#7C3AED');
    doc.text(`Not: ${item.customNotes}`, textX, textY, { width: textW });
    textY = doc.y + 2;
  }

  totalHeight = Math.max(textY - y, imgH + 70);
  doc.fillColor(layout.colors.text); // reset
  return totalHeight;
};

// === FOOTER (her sayfa sonunda) ===

export const renderFooter = (
  doc: PDFKit.PDFDocument,
  layout: any,
  detail: CatalogDetailDTO,
  settings: CatalogPdfSettingsDTO | null,
  currentPage: number,
  totalPages: number,
): void => {
  const style = layout.footer.style;
  if (style === 'none') return;
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const y = doc.page.height - 30;

  doc.fontSize(layout.typography.captionSize);

  if (style === 'simple') {
    if (layout.footer.showContact && settings) {
      const parts: string[] = [];
      if (settings.showPhone) parts.push('Tel: ...');
      if (settings.showEmail) parts.push('Email: ...');
      doc.fillColor(layout.colors.muted).text(parts.join('  -  '), x, y, { width: pageW * 0.6 });
    }
    if (layout.footer.showPageNumbers) {
      doc.fillColor(layout.colors.muted).text(`${currentPage} / ${totalPages}`,
        x, y, { width: pageW, align: 'right' });
    }
  } else if (style === 'bold') {
    // Accent line
    doc.fillColor(layout.colors.accent).rect(x, y - 5, pageW, 1).fill();
    if (settings?.customFooterText) {
      doc.fillColor(layout.colors.text).fontSize(layout.typography.captionSize + 1)
        .text(settings.customFooterText, x, y, { width: pageW * 0.7 });
    }
    if (layout.footer.showPageNumbers) {
      doc.fillColor(layout.colors.primary).fontSize(layout.typography.bodySize)
        .text(`${currentPage} / ${totalPages}`, x, y, { width: pageW, align: 'right' });
    }
  } else if (style === 'minimal') {
    if (layout.footer.showPageNumbers) {
      doc.fillColor(layout.colors.muted).text(`${currentPage} / ${totalPages}`,
        x, y, { width: pageW, align: 'center' });
    }
  }

  doc.fillColor(layout.colors.text); // reset
};
