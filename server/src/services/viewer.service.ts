import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Public viewer service. Auth GEREKTIRMEZ. Sadece 'active' kataloglar.
 *
 * Response shape frontend Viewer.tsx ile uyumlu:
 *   { catalog, fieldConfig, categories, products, customerCount, createdAt }
 *
 * Onceki "minimal" versiyon fields+items nested donuyordu — frontend flat
 * shape (products dizisinde urun bilgisi) bekliyor. Rewrite yapildi.
 */

export interface ViewerCatalogInfo {
  id: string;
  name: string;
  description: string | null;
}

export interface ViewerFieldConfig {
  fieldName: string;
  label: string;
  isVisible: boolean;
  sortOrder: number;
}

export interface ViewerCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
}

export interface ViewerProductImage {
  id: string;
  base64Data: string;
  mimeType: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ViewerProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: { id: string; name: string; slug: string } | null;
  brand: string | null;
  unit: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  sortOrder: number;
  customPrice: number | null;
  customNotes: string | null;
  images: ViewerProductImage[];
}

export interface ViewerResponse {
  catalog: ViewerCatalogInfo;
  fieldConfig: ViewerFieldConfig[];
  categories: ViewerCategory[];
  products: ViewerProduct[];
  customerCount: number;
  createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  sku: 'SKU',
  name: 'Urun Adi',
  description: 'Aciklama',
  price: 'Fiyat',
  currency: 'Para Birimi',
  category: 'Kategori',
  brand: 'Marka',
  unit: 'Birim',
  notes: 'Notlar',
  images: 'Gorseller',
};

const DEFAULT_FIELD_NAMES = ['sku', 'name', 'description', 'price', 'currency', 'category', 'brand', 'unit', 'notes', 'images'] as const;

export const getCatalogForViewer = async (catalogId: string): Promise<ViewerResponse> => {
  const pool = await getPool();

  // Catalog — sadece active
  const cR = await pool.request()
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`SELECT c.id, c.name, c.description, c.created_at AS createdAt,
            (SELECT COUNT(*) FROM catalog_customers WHERE catalog_id = c.id) AS customerCount
     FROM catalogs c WHERE c.id = @id AND c.status = 'active'`);
  const catalog = cR.recordset[0];
  if (!catalog) throw new HttpError(404, 'Katalog bulunamadi veya aktif degil');

  // Field config
  const fcR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT field_name AS fieldName, is_visible AS isVisible, sort_order AS sortOrder
     FROM catalog_field_config WHERE catalog_id = @catalogId ORDER BY sort_order`);
  const fieldConfig: ViewerFieldConfig[] = fcR.recordset.length > 0
    ? fcR.recordset.map((f) => ({
        fieldName: f.fieldName,
        label: FIELD_LABELS[f.fieldName] ?? f.fieldName,
        isVisible: f.isVisible,
        sortOrder: f.sortOrder,
      }))
    : DEFAULT_FIELD_NAMES.map((name, i) => ({
        fieldName: name,
        label: FIELD_LABELS[name] ?? name,
        isVisible: true,
        sortOrder: i,
      }));

  // Items + product + image
  const itemsR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT ci.id AS ciId, ci.sort_order AS sortOrder,
            ci.custom_price AS customPrice, ci.custom_notes AS customNotes,
            p.id AS pId, p.sku, p.name, p.description,
            CAST(p.price AS VARCHAR) AS price, p.currency, p.brand, p.unit, p.notes,
            p.attributes, p.category_id AS categoryId, cat.name AS categoryName, cat.slug AS categorySlug
     FROM catalog_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN categories cat ON cat.id = p.category_id
     WHERE ci.catalog_id = @catalogId
     ORDER BY ci.sort_order`);

  // Tum urun resimleri (toplu, N+1 onlemek icin)
  const allImageR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT pi.id, pi.base64_data AS base64Data, pi.mime_type AS mimeType,
            pi.is_primary AS isPrimary, pi.sort_order AS imageSortOrder, pi.product_id AS productId
     FROM product_images pi
     JOIN catalog_items ci ON ci.product_id = pi.product_id
     WHERE ci.catalog_id = @catalogId
     ORDER BY pi.sort_order`);

  const imagesByProduct = new Map<string, ViewerProductImage[]>();
  for (const img of allImageR.recordset) {
    if (!imagesByProduct.has(img.productId)) imagesByProduct.set(img.productId, []);
    imagesByProduct.get(img.productId)!.push({
      id: img.id,
      base64Data: img.base64Data,
      mimeType: img.mimeType,
      sortOrder: img.imageSortOrder,
      isPrimary: Boolean(img.isPrimary),
    });
  }

  const products: ViewerProduct[] = itemsR.recordset.map((r) => ({
    id: r.pId,
    sku: r.sku,
    name: r.name,
    description: r.description,
    price: Number(r.price),
    currency: r.currency,
    category: r.categoryId
      ? { id: r.categoryId, name: r.categoryName!, slug: r.categorySlug! }
      : null,
    brand: r.brand,
    unit: r.unit,
    notes: r.notes,
    attributes: r.attributes ? safeJsonParse(r.attributes) : {},
    sortOrder: r.sortOrder,
    customPrice: r.customPrice ? Number(r.customPrice) : null,
    customNotes: r.customNotes,
    images: imagesByProduct.get(r.pId) ?? [],
  }));

  // Distinct categories + productCount (flat — tree ileride eklenebilir)
  const categoryMap = new Map<string, ViewerCategory>();
  for (const p of products) {
    if (p.category && !categoryMap.has(p.category.id)) {
      categoryMap.set(p.category.id, {
        id: p.category.id,
        name: p.category.name,
        slug: p.category.slug,
        parentId: null,
        productCount: 0,
      });
    }
  }
  for (const p of products) {
    if (p.category) {
      const cat = categoryMap.get(p.category.id)!;
      cat.productCount++;
    }
  }
  const categories = Array.from(categoryMap.values());

  return {
    catalog: { id: catalog.id, name: catalog.name, description: catalog.description },
    fieldConfig,
    categories,
    products,
    customerCount: catalog.customerCount,
    createdAt: catalog.createdAt.toISOString(),
  };
};

/**
 * attributes JSON parse — bozuk JSON durumunda crash etmek yerine bos obj doner.
 * (DB'de garbage olabilir, viewer'in render'i bozulmasin.)
 */
const safeJsonParse = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return {};
};

logger.info('viewer.service.ts (raw mssql, frontend shape) yuklendi');