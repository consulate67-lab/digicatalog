import { eq, and, asc, desc, sql, gte, lte, inArray, type SQL } from 'drizzle-orm';
import { db } from '../config/database';
import {
  catalogs,
  catalogItems,
  catalogCustomers,
  catalogFieldConfig,
  products,
  customers,
  categories,
  productImages,
  type Catalog,
  type NewCatalog,
  type NewCatalogItem,
  type NewCatalogCustomer,
  type NewCatalogFieldConfig,
} from '../db/schema';
import { withTenant, tenantAnd } from '../db/helpers';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  CATALOG_FIELD_NAMES,
  CATALOG_FIELD_LABELS,
  type CatalogFieldName,
} from '../db/schema/catalogFieldConfig';

/**
 * Catalog service. Katalog olusturma, urun ekleme, musteri atama,
 * alan gorunurluk ve "hizli bant" filtre API.
 *
 * Tenant izolasyonu her query'de withTenant ile.
 * DTO pattern (Faz 2/3 ile ayni).
 */

// === DTOs ===

export interface CatalogSummaryDTO {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  createdBy: string | null;
  itemCount: number;
  customerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItemDTO {
  id: string;
  productId: string;
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
    category: { id: string; name: string } | null;
    brand: string | null;
    unit: string | null;
    notes: string | null;
    primaryImage: { base64Data: string; mimeType: string } | null;
  };
}

export interface CatalogCustomerDTO {
  id: string;
  customerId: string;
  customer: {
    id: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
  };
  createdAt: string;
}

export interface CatalogFieldConfigDTO {
  fieldName: CatalogFieldName;
  isVisible: boolean;
  sortOrder: number;
  label: string;
}

export interface CatalogDetailDTO {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  createdBy: string | null;
  items: CatalogItemDTO[];
  customers: CatalogCustomerDTO[];
  fieldConfig: CatalogFieldConfigDTO[];
  createdAt: string;
  updatedAt: string;
}

// === Helpers ===

const toSummaryDTO = (
  c: Catalog,
  itemCount: number,
  customerCount: number,
): CatalogSummaryDTO => ({
  id: c.id,
  name: c.name,
  description: c.description,
  status: c.status,
  createdBy: c.createdBy,
  itemCount,
  customerCount,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

const DEFAULT_FIELD_CONFIG: Array<Omit<NewCatalogFieldConfig, 'catalogId'>> = CATALOG_FIELD_NAMES.map((name, i) => ({
  fieldName: name,
  isVisible: true,
  sortOrder: i,
}));

// === List ===

export interface ListCatalogsOptions {
  status?: 'draft' | 'active' | 'archived';
  search?: string;
}

export const listCatalogs = async (
  tenantId: string,
  options: ListCatalogsOptions = {},
): Promise<CatalogSummaryDTO[]> => {
  const conditions: (SQL | undefined)[] = [withTenant(catalogs, tenantId)];
  if (options.status) conditions.push(eq(catalogs.status, options.status));
  if (options.search) {
    conditions.push(sql`(${catalogs.name} ILIKE ${`%${options.search}%`} OR ${catalogs.description} ILIKE ${`%${options.search}%`})`);
  }

  const rows = await db
    .select()
    .from(catalogs)
    .where(tenantAnd(catalogs, tenantId, ...conditions))
    .orderBy(desc(catalogs.updatedAt));

  // Item + customer count batch
  const ids = rows.map((r) => r.id);
  const itemCounts = new Map<string, number>();
  const customerCounts = new Map<string, number>();
  if (ids.length > 0) {
    const itemRows = await db
      .select({ catalogId: catalogItems.catalogId, count: sql<number>`count(*)::int` })
      .from(catalogItems)
      .where(inArray(catalogItems.catalogId, ids))
      .groupBy(catalogItems.catalogId);
    for (const r of itemRows) itemCounts.set(r.catalogId, Number(r.count));
    const custRows = await db
      .select({ catalogId: catalogCustomers.catalogId, count: sql<number>`count(*)::int` })
      .from(catalogCustomers)
      .where(inArray(catalogCustomers.catalogId, ids))
      .groupBy(catalogCustomers.catalogId);
    for (const r of custRows) customerCounts.set(r.catalogId, Number(r.count));
  }

  return rows.map((r) => toSummaryDTO(r, itemCounts.get(r.id) ?? 0, customerCounts.get(r.id) ?? 0));
};

// === Get detail ===

export const getCatalog = async (tenantId: string, id: string): Promise<CatalogDetailDTO> => {
  const [catalog] = await db
    .select()
    .from(catalogs)
    .where(and(eq(catalogs.id, id), withTenant(catalogs, tenantId)))
    .limit(1);
  if (!catalog) throw new HttpError(404, 'Katalog bulunamadı');

  const [items, customersRaw, fieldConfig] = await Promise.all([
    db
      .select({
        item: catalogItems,
        product: products,
        category: { id: categories.id, name: categories.name },
      })
      .from(catalogItems)
      .innerJoin(products, eq(catalogItems.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(catalogItems.catalogId, id))
      .orderBy(asc(catalogItems.sortOrder), asc(catalogItems.createdAt)),
    db
      .select({
        cc: catalogCustomers,
        customer: customers,
      })
      .from(catalogCustomers)
      .innerJoin(customers, eq(catalogCustomers.customerId, customers.id))
      .where(eq(catalogCustomers.catalogId, id))
      .orderBy(asc(catalogCustomers.createdAt)),
    db
      .select()
      .from(catalogFieldConfig)
      .where(eq(catalogFieldConfig.catalogId, id))
      .orderBy(asc(catalogFieldConfig.sortOrder)),
  ]);

  // Resimler (N+1 kabul, item sayisi az)
  const productIds = items.map((i) => i.product.id);
  const imageMap = new Map<string, { base64Data: string; mimeType: string }>();
  if (productIds.length > 0) {
    const imgs = await db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds));
    for (const img of imgs) {
      if (img.isPrimary) {
        imageMap.set(img.productId, { base64Data: img.base64Data, mimeType: img.mimeType });
      }
    }
    // Primary yoksa sortOrder=0 olanı al
    for (const img of imgs) {
      if (!imageMap.has(img.productId) && img.sortOrder === 0) {
        imageMap.set(img.productId, { base64Data: img.base64Data, mimeType: img.mimeType });
      }
    }
  }

  const itemDTOs: CatalogItemDTO[] = items.map((r) => ({
    id: r.item.id,
    productId: r.item.productId,
    sortOrder: r.item.sortOrder,
    customPrice: r.item.customPrice !== null ? Number(r.item.customPrice) : null,
    customNotes: r.item.customNotes,
    product: {
      id: r.product.id,
      sku: r.product.sku,
      name: r.product.name,
      description: r.product.description,
      price: Number(r.product.price),
      currency: r.product.currency,
      category: r.category?.id ? { id: r.category.id, name: r.category.name } : null,
      brand: r.product.brand,
      unit: r.product.unit,
      notes: r.product.notes,
      primaryImage: imageMap.get(r.product.id) ?? null,
    },
  }));

  const customerDTOs: CatalogCustomerDTO[] = customersRaw.map((r) => ({
    id: r.cc.id,
    customerId: r.cc.customerId,
    customer: {
      id: r.customer.id,
      name: r.customer.name,
      contactName: r.customer.contactName,
      email: r.customer.email,
      phone: r.customer.phone,
    },
    createdAt: r.cc.createdAt.toISOString(),
  }));

  const fieldDTOs: CatalogFieldConfigDTO[] = fieldConfig.map((f) => ({
    fieldName: f.fieldName as CatalogFieldName,
    isVisible: f.isVisible,
    sortOrder: f.sortOrder,
    label: CATALOG_FIELD_LABELS[f.fieldName as CatalogFieldName] ?? f.fieldName,
  }));

  return {
    id: catalog.id,
    name: catalog.name,
    description: catalog.description,
    status: catalog.status,
    createdBy: catalog.createdBy,
    items: itemDTOs,
    customers: customerDTOs,
    fieldConfig: fieldDTOs,
    createdAt: catalog.createdAt.toISOString(),
    updatedAt: catalog.updatedAt.toISOString(),
  };
};

// === Create ===

export interface CreateCatalogInput {
  name: string;
  description?: string | null;
  status?: 'draft' | 'active' | 'archived';
}

export const createCatalog = async (
  tenantId: string,
  userId: string,
  input: CreateCatalogInput,
): Promise<CatalogSummaryDTO> => {
  if (!input.name?.trim()) throw new HttpError(400, 'Katalog adı zorunludur');

  const result = await db.transaction(async (tx) => {
    const insertData: NewCatalog = {
      tenantId,
      name: input.name.trim(),
      description: input.description ?? null,
      status: input.status ?? 'draft',
      createdBy: userId,
    };
    const [created] = await tx.insert(catalogs).values(insertData).returning();

    // Default field config (tum 10 alan visible)
    await tx.insert(catalogFieldConfig).values(
      DEFAULT_FIELD_CONFIG.map((f) => ({ ...f, catalogId: created.id })),
    );

    return created;
  });

  logger.info({ catalogId: result.id, tenantId, userId, name: result.name }, 'Catalog created');
  return toSummaryDTO(result, 0, 0);
};

// === Update ===

export const updateCatalog = async (
  tenantId: string,
  id: string,
  input: Partial<CreateCatalogInput>,
): Promise<CatalogSummaryDTO> => {
  // Tenant kontrolu (full fetch yerine basit varlık kontrolu)
  const [existing] = await db
    .select({ id: catalogs.id })
    .from(catalogs)
    .where(and(eq(catalogs.id, id), withTenant(catalogs, tenantId)))
    .limit(1);
  if (!existing) throw new HttpError(404, 'Katalog bulunamadı');

  const updateData: Partial<NewCatalog> = {
    name: input.name?.trim(),
    description: input.description,
    status: input.status,
    updatedAt: new Date(),
  };
  await db
    .update(catalogs)
    .set(updateData)
    .where(and(eq(catalogs.id, id), withTenant(catalogs, tenantId)));

  const [itemCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogItems)
    .where(eq(catalogItems.catalogId, id));
  const [customerCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogCustomers)
    .where(eq(catalogCustomers.catalogId, id));
  const [updated] = await db
    .select()
    .from(catalogs)
    .where(eq(catalogs.id, id))
    .limit(1);
  return toSummaryDTO(updated, Number(itemCountRow?.count ?? 0), Number(customerCountRow?.count ?? 0));
};

// === Delete ===

export const deleteCatalog = async (tenantId: string, id: string): Promise<void> => {
  const result = await db
    .delete(catalogs)
    .where(and(eq(catalogs.id, id), withTenant(catalogs, tenantId)))
    .returning({ id: catalogs.id });
  if (result.length === 0) throw new HttpError(404, 'Katalog bulunamadı');
  // catalog_items, catalog_customers, catalog_field_config CASCADE ile silinir
  logger.info({ catalogId: id, tenantId }, 'Catalog deleted');
};

// === Customers ===

export const assignCustomers = async (
  tenantId: string,
  catalogId: string,
  customerIds: string[],
): Promise<{ added: number; skipped: number }> => {
  await getCatalog(tenantId, catalogId);

  // Tum customer'lar bu tenant'a mi ait?
  if (customerIds.length === 0) return { added: 0, skipped: 0 };
  const valid = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(withTenant(customers, tenantId), inArray(customers.id, customerIds)));
  const validIds = new Set(valid.map((c) => c.id));

  // Mevcut atamalar
  const existing = await db
    .select({ customerId: catalogCustomers.customerId })
    .from(catalogCustomers)
    .where(
      and(
        eq(catalogCustomers.catalogId, catalogId),
        inArray(catalogCustomers.customerId, customerIds),
      ),
    );
  const existingSet = new Set(existing.map((e) => e.customerId));

  const toAdd: NewCatalogCustomer[] = customerIds
    .filter((id) => validIds.has(id) && !existingSet.has(id))
    .map((id) => ({ catalogId, customerId: id }));

  if (toAdd.length > 0) {
    // ON CONFLICT DO NOTHING benzeri: insert + duplicate'leri yut
    for (const row of toAdd) {
      try {
        await db.insert(catalogCustomers).values(row);
      } catch {
        // unique violation, skip
      }
    }
  }
  return { added: toAdd.length, skipped: customerIds.length - toAdd.length };
};

export const removeCustomer = async (
  tenantId: string,
  catalogId: string,
  customerId: string,
): Promise<void> => {
  // Tenant kontrolu
  const [catalog] = await db
    .select({ id: catalogs.id })
    .from(catalogs)
    .where(and(eq(catalogs.id, catalogId), withTenant(catalogs, tenantId)))
    .limit(1);
  if (!catalog) throw new HttpError(404, 'Katalog bulunamadı');

  await db
    .delete(catalogCustomers)
    .where(
      and(
        eq(catalogCustomers.catalogId, catalogId),
        eq(catalogCustomers.customerId, customerId),
      ),
    );
};

// === Items ===

export const addItem = async (
  tenantId: string,
  catalogId: string,
  input: { productId: string; customPrice?: number | null; customNotes?: string | null; sortOrder?: number },
): Promise<CatalogItemDTO> => {
  await getCatalog(tenantId, catalogId);

  // Product var mi ve tenant'a mi ait?
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, input.productId), withTenant(products, tenantId)))
    .limit(1);
  if (!product) throw new HttpError(404, 'Ürün bulunamadı');

  // Mevcut mu kontrol (unique)
  const [existing] = await db
    .select()
    .from(catalogItems)
    .where(
      and(eq(catalogItems.catalogId, catalogId), eq(catalogItems.productId, input.productId)),
    )
    .limit(1);
  if (existing) {
    // Update (customPrice/Notes/sortOrder)
    await db
      .update(catalogItems)
      .set({
        customPrice: input.customPrice !== undefined ? (input.customPrice !== null ? String(input.customPrice) : null) : existing.customPrice,
        customNotes: input.customNotes !== undefined ? input.customNotes : existing.customNotes,
        sortOrder: input.sortOrder ?? existing.sortOrder,
      })
      .where(eq(catalogItems.id, existing.id));
    return (await getCatalog(tenantId, catalogId)).items.find((i) => i.id === existing.id)!;
  }

  const insertData: NewCatalogItem = {
    catalogId,
    productId: input.productId,
    customPrice: input.customPrice !== undefined && input.customPrice !== null ? String(input.customPrice) : null,
    customNotes: input.customNotes ?? null,
    sortOrder: input.sortOrder ?? 0,
  };
  const [created] = await db.insert(catalogItems).values(insertData).returning();
  return (await getCatalog(tenantId, catalogId)).items.find((i) => i.id === created.id)!;
};

export const removeItem = async (
  tenantId: string,
  catalogId: string,
  itemId: string,
): Promise<void> => {
  await getCatalog(tenantId, catalogId); // tenant kontrolu
  await db
    .delete(catalogItems)
    .where(and(eq(catalogItems.id, itemId), eq(catalogItems.catalogId, catalogId)));
};

// === Field config ===

export const updateFieldConfig = async (
  tenantId: string,
  catalogId: string,
  fields: Array<{ fieldName: CatalogFieldName; isVisible: boolean; sortOrder: number }>,
): Promise<CatalogFieldConfigDTO[]> => {
  await getCatalog(tenantId, catalogId);

  // Validate
  const validNames = new Set<string>(CATALOG_FIELD_NAMES);
  for (const f of fields) {
    if (!validNames.has(f.fieldName)) {
      throw new HttpError(400, `Geçersiz alan: ${f.fieldName}. İzin verilenler: ${CATALOG_FIELD_NAMES.join(', ')}`);
    }
  }

  // Replace all (delete + bulk insert)
  await db.transaction(async (tx) => {
    await tx.delete(catalogFieldConfig).where(eq(catalogFieldConfig.catalogId, catalogId));
    if (fields.length > 0) {
      await tx.insert(catalogFieldConfig).values(
        fields.map((f) => ({
          catalogId,
          fieldName: f.fieldName,
          isVisible: f.isVisible,
          sortOrder: f.sortOrder,
        })),
      );
    }
  });

  return (await getCatalog(tenantId, catalogId)).fieldConfig;
};

// === Fast-band filter (ürün seçim wizard'ı için) ===

export interface ProductFilterOptions {
  search?: string;
  categoryId?: string;
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  excludeInCatalog?: boolean; // katalogda zaten olan ürünleri gizle
  limit?: number;
}

export interface FilteredProductDTO {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency: string;
  category: { id: string; name: string } | null;
  brand: string | null;
  primaryImage: { base64Data: string; mimeType: string } | null;
  alreadyInCatalog: boolean;
}

export const filterProductsForCatalog = async (
  tenantId: string,
  catalogId: string | null,
  options: ProductFilterOptions = {},
): Promise<FilteredProductDTO[]> => {
  const conditions: (SQL | undefined)[] = [
    withTenant(products, tenantId),
    eq(products.isActive, true),
  ];
  if (options.search) {
    const term = `%${options.search}%`;
    conditions.push(sql`(${products.name} ILIKE ${term} OR ${products.sku} ILIKE ${term})`);
  }
  if (options.categoryId) conditions.push(eq(products.categoryId, options.categoryId));
  if (options.brand) conditions.push(sql`${products.brand} ILIKE ${`%${options.brand}%`}`);
  if (options.priceMin !== undefined) conditions.push(gte(products.price, String(options.priceMin)));
  if (options.priceMax !== undefined) conditions.push(lte(products.price, String(options.priceMax)));

  const limit = Math.min(100, Math.max(1, options.limit ?? 50));

  const rows = await db
    .select({
      product: products,
      category: { id: categories.id, name: categories.name },
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(tenantAnd(products, tenantId, ...conditions))
    .orderBy(asc(products.name))
    .limit(limit);

  // Already in catalog?
  const alreadyIds = new Set<string>();
  if (catalogId && options.excludeInCatalog !== false) {
    const existing = await db
      .select({ productId: catalogItems.productId })
      .from(catalogItems)
      .where(eq(catalogItems.catalogId, catalogId));
    for (const e of existing) alreadyIds.add(e.productId);
  }

  // Primary image
  const productIds = rows.map((r) => r.product.id);
  const imageMap = new Map<string, { base64Data: string; mimeType: string }>();
  if (productIds.length > 0) {
    const imgs = await db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds));
    for (const img of imgs) {
      if (img.isPrimary) imageMap.set(img.productId, { base64Data: img.base64Data, mimeType: img.mimeType });
    }
    for (const img of imgs) {
      if (!imageMap.has(img.productId) && img.sortOrder === 0) {
        imageMap.set(img.productId, { base64Data: img.base64Data, mimeType: img.mimeType });
      }
    }
  }

  return rows.map((r) => ({
    id: r.product.id,
    sku: r.product.sku,
    name: r.product.name,
    price: Number(r.product.price),
    currency: r.product.currency,
    category: r.category?.id ? { id: r.category.id, name: r.category.name } : null,
    brand: r.product.brand,
    primaryImage: imageMap.get(r.product.id) ?? null,
    alreadyInCatalog: alreadyIds.has(r.product.id),
  }));
};
