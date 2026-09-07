import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '../config/database';
import {
  catalogs,
  catalogItems,
  catalogCustomers,
  catalogFieldConfig,
  products,
  productImages,
  categories,
} from '../db/schema';
import { HttpError } from '../middleware/errorHandler';
import { CATALOG_FIELD_LABELS, type CatalogFieldName } from '../db/schema/catalogFieldConfig';

/**
 * Public viewer service. Auth gerektirmez, sadece 'active' statuslu
 * kataloglara erisim saglar. Link-based paylasim (musteri ziyareti).
 *
 * Gucvenlik notu:
 * - catalogId bilinmeli (URL'de)
 * - Sadece 'active' statuslu kataloglar listelenir
 * - Tum tenant izolasyonu catalog uzerinden saglanir (her katalog
 *   tek bir tenant'a ait)
 *
 * Faz 7'de (PIN/token-based access) ek guvenlik katmanlari eklenebilir.
 */

// === DTO ===

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

export interface ViewerCategoryNode {
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
  images: ViewerProductImage[];
  // Override'lar
  customPrice: number | null;
  customNotes: string | null;
}

export interface ViewerResponse {
  catalog: ViewerCatalogInfo;
  fieldConfig: ViewerFieldConfig[];
  categories: ViewerCategoryNode[];
  products: ViewerProduct[];
  customerCount: number;
  createdAt: string;
}

// === Service ===

export const getCatalogForViewer = async (catalogId: string): Promise<ViewerResponse> => {
  // Katalog var mi ve aktif mi?
  const [catalog] = await db
    .select()
    .from(catalogs)
    .where(eq(catalogs.id, catalogId))
    .limit(1);
  if (!catalog) throw new HttpError(404, 'Katalog bulunamadı');
  if (catalog.status !== 'active') {
    throw new HttpError(404, 'Katalog görüntülenemiyor (taslak veya arşiv)');
  }

  // Items, field config, customers paralel
  const [items, fieldConfigRows, customerCountRows] = await Promise.all([
    db
      .select({
        item: catalogItems,
        product: products,
        category: { id: categories.id, name: categories.name, slug: categories.slug },
      })
      .from(catalogItems)
      .innerJoin(products, eq(catalogItems.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(catalogItems.catalogId, catalogId))
      .orderBy(asc(catalogItems.sortOrder), asc(catalogItems.createdAt)),
    db
      .select()
      .from(catalogFieldConfig)
      .where(eq(catalogFieldConfig.catalogId, catalogId))
      .orderBy(asc(catalogFieldConfig.sortOrder)),
    db
      .select({ count: catalogCustomers.id })
      .from(catalogCustomers)
      .where(eq(catalogCustomers.catalogId, catalogId)),
  ]);

  // Resimler (batch)
  const productIds = items.map((i) => i.product.id);
  const imageMap = new Map<string, ViewerProductImage[]>();
  if (productIds.length > 0) {
    const images = await db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
    for (const img of images) {
      const list = imageMap.get(img.productId) ?? [];
      list.push({
        id: img.id,
        base64Data: img.base64Data,
        mimeType: img.mimeType,
        sortOrder: img.sortOrder,
        isPrimary: img.isPrimary,
      });
      imageMap.set(img.productId, list);
    }
  }

  // Kategori agaci: katalogdaki urunlerin kategorileri
  const categoryIdsSet = new Set<string>();
  const categoryMap = new Map<string, ViewerCategoryNode>();
  for (const r of items) {
    if (r.category?.id) {
      categoryIdsSet.add(r.category.id);
      if (!categoryMap.has(r.category.id)) {
        categoryMap.set(r.category.id, {
          id: r.category.id,
          name: r.category.name,
          slug: r.category.slug,
          parentId: null, // sonra doldurulur
          productCount: 0,
        });
      }
      categoryMap.get(r.category.id)!.productCount += 1;
    }
  }

  // Parent ID'leri cek
  if (categoryIdsSet.size > 0) {
    const parentRows = await db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(inArray(categories.id, [...categoryIdsSet]));
    for (const row of parentRows) {
      const node = categoryMap.get(row.id);
      if (node) node.parentId = row.parentId;
    }
  }

  // Field config
  const fieldConfig: ViewerFieldConfig[] = fieldConfigRows.map((f) => ({
    fieldName: f.fieldName,
    label: CATALOG_FIELD_LABELS[f.fieldName as CatalogFieldName] ?? f.fieldName,
    isVisible: f.isVisible,
    sortOrder: f.sortOrder,
  }));

  return {
    catalog: {
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
    },
    fieldConfig,
    categories: [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    products: items.map((r) => ({
      id: r.product.id,
      sku: r.product.sku,
      name: r.product.name,
      description: r.product.description,
      price: r.item.customPrice !== null ? Number(r.item.customPrice) : Number(r.product.price),
      currency: r.product.currency,
      category: r.category?.id ? { id: r.category.id, name: r.category.name, slug: r.category.slug } : null,
      brand: r.product.brand,
      unit: r.product.unit,
      notes: r.item.customNotes ?? r.product.notes,
      attributes: r.product.attributes ?? {},
      sortOrder: r.item.sortOrder,
      images: imageMap.get(r.product.id) ?? [],
      customPrice: r.item.customPrice !== null ? Number(r.item.customPrice) : null,
      customNotes: r.item.customNotes,
    })),
    customerCount: customerCountRows.length,
    createdAt: catalog.createdAt.toISOString(),
  };
};
