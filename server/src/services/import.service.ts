import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import { and, inArray } from 'drizzle-orm';
import { db } from '../config/database';
import { products, categories, type NewProduct } from '../db/schema';
import { withTenant } from '../db/helpers';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { bulkCreateCustomers } from './customer.service';

/**
 * Bulk import service. Excel (.xlsx/.xls) veya XML'den ürün yükler.
 *
 * Excel beklenen sütunlar (büyük-küçük harf duyarsız, header 1. satır):
 *   SKU | Name | Description | Price | Currency | Category | Brand | Unit | Notes | Attributes
 *
 * Attributes hücresi JSON string olabilir: {"color":"red","size":"XL"}
 *
 * XML beklenen format:
 *   <products>
 *     <product>
 *       <sku>...</sku> <name>...</name> ...
 *     </product>
 *   </products>
 *
 * Davranış:
 * - SKU + Name zorunlu, yoksa satır atlanır + error
 * - Aynı SKU zaten varsa atlanır (mevcut tenant içinde)
 * - Aynı SKU import içinde iki kez gelirse ikincisi atlanır
 * - Currency geçersizse TRY default
 * - Category name bulunamazsa otomatik oluşturulur (slug auto-generate)
 * - Bulk insert: 100'lü chunk'larla (query size limiti)
 *
 * Response:
 *   { total, added, skipped, errors: [{ row, sku, message }] }
 */

export interface ImportResult {
  total: number;
  added: number;
  skipped: number;
  errors: Array<{ row: number; sku?: string; message: string }>;
}

const ALLOWED_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
const CHUNK_SIZE = 100;

const slugify = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
};

const parseAttributes = (raw: unknown): Record<string, unknown> => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const parsePrice = (raw: unknown): number | undefined => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    // "1.234,56" Türkçe format desteği
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(normalized);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
};

const parseCurrency = (raw: unknown): 'TRY' | 'USD' | 'EUR' | 'GBP' => {
  if (typeof raw === 'string' && ALLOWED_CURRENCIES.includes(raw.toUpperCase() as never)) {
    return raw.toUpperCase() as 'TRY' | 'USD' | 'EUR' | 'GBP';
  }
  return 'TRY';
};

interface ParsedRow {
  sku?: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: 'TRY' | 'USD' | 'EUR' | 'GBP';
  categoryName?: string;
  brand?: string;
  unit?: string;
  notes?: string;
  attributes?: Record<string, unknown>;
}

// === Excel ===

export const importFromExcel = async (
  tenantId: string,
  buffer: Buffer,
): Promise<ImportResult> => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new HttpError(400, 'Excel dosyası boş veya okunamadı');

  const sheet = workbook.Sheets[sheetName];
  // Header row → keys, normalize to lowercase
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true, // keep numbers as numbers
  });

  const rows: ParsedRow[] = rawRows.map((r) => {
    const lower: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      lower[k.toLowerCase().trim()] = v;
    }
    return {
      sku: lower.sku?.toString().trim(),
      name: lower.name?.toString().trim(),
      description: lower.description?.toString().trim() || undefined,
      price: parsePrice(lower.price),
      currency: lower.currency ? parseCurrency(lower.currency) : undefined,
      categoryName: lower.category?.toString().trim() || undefined,
      brand: lower.brand?.toString().trim() || undefined,
      unit: lower.unit?.toString().trim() || undefined,
      notes: lower.notes?.toString().trim() || undefined,
      attributes: parseAttributes(lower.attributes),
    };
  });

  return importRows(tenantId, rows);
};

// === XML ===

export const importFromXml = async (
  tenantId: string,
  buffer: Buffer,
): Promise<ImportResult> => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
  });
  const xml = buffer.toString('utf-8');
  const obj = parser.parse(xml);

  // Çeşitli XML yapılarını destekle
  let productsXml: any[] = [];
  if (obj.products?.product) {
    productsXml = Array.isArray(obj.products.product)
      ? obj.products.product
      : [obj.products.product];
  } else if (Array.isArray(obj.product)) {
    productsXml = obj.product;
  } else if (obj.product) {
    productsXml = [obj.product];
  } else {
    throw new HttpError(
      400,
      'XML yapısı beklenen formatta değil. Örnek: <products><product>...</product></products>',
    );
  }

  const rows: ParsedRow[] = productsXml.map((p: any) => ({
    sku: p.sku?.toString().trim(),
    name: p.name?.toString().trim(),
    description: p.description?.toString().trim() || undefined,
    price: parsePrice(p.price),
    currency: p.currency ? parseCurrency(p.currency) : undefined,
    categoryName: p.category?.toString().trim() || undefined,
    brand: p.brand?.toString().trim() || undefined,
    unit: p.unit?.toString().trim() || undefined,
    notes: p.notes?.toString().trim() || undefined,
    attributes: parseAttributes(p.attributes),
  }));

  return importRows(tenantId, rows);
};

// === Common logic ===

const importRows = async (tenantId: string, rows: ParsedRow[]): Promise<ImportResult> => {
  const result: ImportResult = {
    total: rows.length,
    added: 0,
    skipped: 0,
    errors: [],
  };

  if (rows.length === 0) {
    return result;
  }

  // 1) Mevcut SKU'ları al (efficient duplicate detection)
  const requestedSkus = Array.from(
    new Set(rows.map((r) => r.sku ?? '').filter((s) => s.length > 0)),
  );
  const existingSkus = new Set<string>();
  if (requestedSkus.length > 0) {
    const existing = await db
      .select({ sku: products.sku })
      .from(products)
      .where(and(withTenant(products, tenantId), inArray(products.sku, requestedSkus)));
    for (const e of existing) existingSkus.add(e.sku);
  }

  // 2) Kategorileri topla (auto-create)
  const categoryNames = Array.from(
    new Set(rows.map((r) => r.categoryName).filter((c): c is string => !!c)),
  );
  const categoryMap = new Map<string, string>(); // name → id
  if (categoryNames.length > 0) {
    const existing = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(withTenant(categories, tenantId));
    for (const c of existing) categoryMap.set(c.name, c.id);

    // Eksik kategorileri oluştur
    for (const name of categoryNames) {
      if (!categoryMap.has(name)) {
        const baseSlug = slugify(name) || `cat-${Date.now()}`;
        let slug = baseSlug;
        let attempt = 0;
        while (attempt < 10) {
          try {
            const [created] = await db
              .insert(categories)
              .values({ tenantId, name, slug, sortOrder: 0, isActive: true })
              .returning({ id: categories.id });
            categoryMap.set(name, created.id);
            break;
          } catch (e) {
            attempt++;
            slug = `${baseSlug}-${attempt}`;
          }
        }
      }
    }
  }

  // 3) Her satırı validate et, insert listesine ekle
  const toInsert: NewProduct[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel/header convention: row 1 is header, data starts row 2

    if (!row.sku || !row.name) {
      result.errors.push({ row: rowNum, sku: row.sku, message: 'SKU ve Name zorunludur' });
      result.skipped++;
      continue;
    }
    const sku = row.sku;
    if (existingSkus.has(sku)) {
      result.errors.push({ row: rowNum, sku, message: 'Bu SKU zaten mevcut' });
      result.skipped++;
      continue;
    }
    if (row.price !== undefined && row.price < 0) {
      result.errors.push({ row: rowNum, sku, message: 'Geçersiz fiyat (negatif olamaz)' });
      result.skipped++;
      continue;
    }

    const categoryId = row.categoryName ? categoryMap.get(row.categoryName) ?? null : null;

    toInsert.push({
      tenantId,
      sku,
      name: row.name,
      description: row.description ?? null,
      price: String(row.price ?? 0),
      currency: row.currency ?? 'TRY',
      categoryId,
      brand: row.brand ?? null,
      unit: row.unit ?? null,
      notes: row.notes ?? null,
      attributes: row.attributes ?? {},
      sortOrder: 0,
      isActive: true,
    });
    existingSkus.add(sku); // prevent in-batch duplicates
  }

  // 4) Bulk insert (chunked)
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      await db.insert(products).values(chunk);
    }
    result.added = toInsert.length;
  }

  logger.info(
    {
      tenantId,
      total: result.total,
      added: result.added,
      skipped: result.skipped,
      errorCount: result.errors.length,
    },
    'Bulk product import completed',
  );

  return result;
};

// === Customer Excel Import ===

export interface CustomerImportResult {
  total: number;
  added: number;
  skipped: number;
  errors: Array<{ row: number; name?: string; message: string }>;
}

/**
 * POST /api/customers/import/excel için Excel parser.
 *
 * Beklenen sütunlar (büyük-küçük harf duyarsız):
 *   Name | ContactName | Email | Phone | Address | TaxNumber | TaxOffice | Notes
 *
 * Davranış:
 * - Name zorunlu, yoksa satır atlanır + error
 * - Aynı tenant'ta aynı name ile müşteri zaten varsa atlanır
 * - bulkCreateCustomers 100'lük chunk'larla insert eder
 */
export const importCustomersFromExcel = async (
  tenantId: string,
  buffer: Buffer,
): Promise<CustomerImportResult> => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new HttpError(400, 'Excel dosyası boş veya okunamadı');

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const result: CustomerImportResult = {
    total: rawRows.length,
    added: 0,
    skipped: 0,
    errors: [],
  };

  if (rawRows.length === 0) return result;

  const inputs: Array<{
    name: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    taxNumber?: string | null;
    taxOffice?: string | null;
    notes?: string | null;
    source: 'excel';
  }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const rowNum = i + 2;
    const lower: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      lower[k.toLowerCase().trim()] = v;
    }
    const name = lower.name?.toString().trim();
    if (!name) {
      result.errors.push({ row: rowNum, message: 'Name zorunludur' });
      result.skipped++;
      continue;
    }
    inputs.push({
      name,
      contactName: lower.contactname?.toString().trim() || null,
      email: lower.email?.toString().trim() || null,
      phone: lower.phone?.toString().trim() || null,
      address: lower.address?.toString().trim() || null,
      taxNumber: lower.taxnumber?.toString().trim() || null,
      taxOffice: lower.taxoffice?.toString().trim() || null,
      notes: lower.notes?.toString().trim() || null,
      source: 'excel',
    });
  }

  if (inputs.length > 0) {
    const { added } = await bulkCreateCustomers(tenantId, inputs);
    result.added = added;
    // skipped: duplicate names + empty names (already counted)
    const duplicates = inputs.length - added;
    if (duplicates > 0) {
      result.skipped += duplicates;
      // İsimsiz duplicate'leri error olarak göstermek zor, basit mesaj:
      result.errors.push({
        row: 0,
        message: `${duplicates} satır aynı isimle zaten mevcut olduğu için atlandı`,
      });
    }
  }

  logger.info(
    { tenantId, ...result },
    'Bulk customer import completed',
  );

  return result;
};
