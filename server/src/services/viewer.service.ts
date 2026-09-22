import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Public viewer service (raw mssql minimal).
 *
 * Sadece 'active' statuslu kataloglar listelenir. Auth gerekmez.
 *
 * NOT: Drizzle ORM'den raw mssql'e gecildi. Bu minimal versiyon sadece
 * temel viewer API'sini icerir. Filtreleme/grup/arama sonra eklenebilir.
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

export const getCatalogForViewer = async (catalogId: string): Promise<{
  catalog: ViewerCatalogInfo;
  fields: ViewerFieldConfig[];
  items: Array<{
    id: string;
    sortOrder: number;
    customPrice: number | null;
    customNotes: string | null;
    product: {
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
      primaryImage: { base64Data: string; mimeType: string } | null;
      images: Array<{ id: string; base64Data: string; mimeType: string }>;
    };
  }>;
}> => {
  const pool = await getPool();

  // Catalog — sadece active
  const cR = await pool.request()
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id, name, description FROM catalogs WHERE id = @id AND status = 'active'`);
  const catalog = cR.recordset[0];
  if (!catalog) throw new HttpError(404, 'Katalog bulunamadi veya aktif degil');

  // Field config
  const fcR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT field_name AS fieldName, is_visible AS isVisible, sort_order AS sortOrder
     FROM catalog_field_config WHERE catalog_id = @catalogId ORDER BY sort_order`);

  const fields: ViewerFieldConfig[] = fcR.recordset.length > 0
    ? fcR.recordset.map((f) => ({
        fieldName: f.fieldName,
        label: FIELD_LABELS[f.fieldName] ?? f.fieldName,
        isVisible: f.isVisible,
        sortOrder: f.sortOrder,
      }))
    : ['sku', 'name', 'description', 'price', 'currency', 'category', 'brand', 'unit', 'notes', 'images']
        .map((name, i) => ({ fieldName: name, label: FIELD_LABELS[name] ?? name, isVisible: true, sortOrder: i }));

  // Items (filter only visible fields would be a nice-to-have; here we send full)
  const itemsR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT ci.id, ci.sort_order AS sortOrder, ci.custom_price AS customPrice,
            ci.custom_notes AS customNotes,
            p.id AS pId, p.sku, p.name, p.description,
            CAST(p.price AS VARCHAR) AS price, p.currency, p.brand, p.unit, p.notes,
            p.category_id AS categoryId, c.name AS categoryName, c.slug AS categorySlug
     FROM catalog_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ci.catalog_id = @catalogId
     ORDER BY ci.sort_order`);

  // Tum image'lar toplu
  const allImageR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT pi.id, pi.base64_data AS base64Data, pi.mime_type AS mimeType,
            pi.is_primary AS isPrimary, pi.product_id AS productId
     FROM product_images pi
     JOIN catalog_items ci ON ci.product_id = pi.product_id
     WHERE ci.catalog_id = @catalogId
     ORDER BY pi.sort_order`);

  const imagesByProduct = new Map<string, Array<{ id: string; base64Data: string; mimeType: string }>>();
  for (const img of allImageR.recordset) {
    if (!imagesByProduct.has(img.productId)) imagesByProduct.set(img.productId, []);
    imagesByProduct.get(img.productId)!.push({ id: img.id, base64Data: img.base64Data, mimeType: img.mimeType });
  }

  const items = itemsR.recordset.map((r) => {
    const imgs = imagesByProduct.get(r.pId) ?? [];
    const primary = imgs.find((i) => i.id === imgs[0]?.id) ?? imgs[0] ?? null;
    return {
      id: r.id,
      sortOrder: r.sortOrder,
      customPrice: r.customPrice ? Number(r.customPrice) : null,
      customNotes: r.customNotes,
      product: {
        id: r.pId,
        sku: r.sku,
        name: r.name,
        description: r.description,
        price: Number(r.price),
        currency: r.currency,
        category: r.categoryId ? { id: r.categoryId, name: r.categoryName!, slug: r.categorySlug! } : null,
        brand: r.brand,
        unit: r.unit,
        notes: r.notes,
        primaryImage: primary ? { base64Data: primary.base64Data, mimeType: primary.mimeType } : null,
        images: imgs.map((i) => ({ id: i.id, base64Data: i.base64Data, mimeType: i.mimeType })),
      },
    };
  });

  return { catalog, fields, items };
};

logger.info('viewer.service.ts (raw mssql, minimal) yuklendi');