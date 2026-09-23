import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Catalog service. Raw mssql ile multi-tenant row-level isolation.
 *
 * Tum write tarafi (create/update/delete + assignCustomers + addItem +
 * fieldConfig + filterProductsForCatalog) bu versiyonda implement edildi.
 * Onceki "minimal" stub'lar kaldirildi.
 */

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

export interface CatalogDetailDTO {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: CatalogItemDTO[];
  customers: CatalogCustomerDTO[];
  fieldConfig: Array<{ fieldName: string; isVisible: boolean; sortOrder: number }>;
}

export interface CatalogInput {
  name: string;
  description?: string | null;
  status?: 'draft' | 'active' | 'archived';
}

export interface CatalogItemInput {
  productId: string;
  customPrice?: number | null;
  customNotes?: string | null;
  sortOrder?: number;
}

export interface FieldConfigInput {
  fieldName: string;
  isVisible: boolean;
  sortOrder: number;
}

const CATALOG_FIELD_NAMES = ['sku', 'name', 'description', 'price', 'currency', 'category', 'brand', 'unit', 'notes', 'images'] as const;

// === List ===

export const listCatalogs = async (
  tenantId: string,
  options: { status?: 'draft' | 'active' | 'archived'; search?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: CatalogSummaryDTO[]; total: number; page: number; limit: number }> => {
  const pool = await getPool();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  let where = 'c.tenant_id = @tenantId';
  if (options.status) where += ' AND c.status = @status';
  if (options.search) {
    where += ` AND (LOWER(c.name) LIKE @search OR LOWER(COALESCE(c.description, '')) LIKE @search)`;
  }

  const itemsR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('status', sql.NVarChar, options.status ?? null)
    .input('search', sql.NVarChar, options.search ? `%${options.search.toLowerCase()}%` : '')
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize)
    .query(`SELECT c.id, c.name, c.description, c.status, c.created_by AS createdBy,
            c.created_at AS createdAt, c.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM catalog_items WHERE catalog_id = c.id) AS itemCount,
            (SELECT COUNT(*) FROM catalog_customers WHERE catalog_id = c.id) AS customerCount
     FROM catalogs c WHERE ${where}
     ORDER BY c.updated_at DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);

  const totalR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('status', sql.NVarChar, options.status ?? null)
    .input('search', sql.NVarChar, options.search ? `%${options.search.toLowerCase()}%` : '')
    .query(`SELECT COUNT(*) AS total FROM catalogs c WHERE ${where}`);
  const total = totalR.recordset[0]?.total ?? 0;

  const items: CatalogSummaryDTO[] = itemsR.recordset.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    createdBy: c.createdBy,
    itemCount: c.itemCount,
    customerCount: c.customerCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
  return { items, total, page, limit: pageSize };
};

// === Get (detail) ===

export const getCatalog = async (tenantId: string, id: string): Promise<CatalogDetailDTO> => {
  const pool = await getPool();
  const cR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT id, tenant_id AS tenantId, name, description, status, created_by AS createdBy,
            created_at AS createdAt, updated_at AS updatedAt
     FROM catalogs WHERE id = @id AND tenant_id = @tenantId`);
  const catalog = cR.recordset[0];
  if (!catalog) throw new HttpError(404, 'Katalog bulunamadi');

  const itemsR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, id)
    .query(`SELECT ci.id, ci.product_id AS productId, ci.sort_order AS sortOrder,
            ci.custom_price AS customPrice, ci.custom_notes AS customNotes,
            p.id AS pId, p.sku, p.name AS pName, p.description AS pDescription,
            CAST(p.price AS VARCHAR) AS pPrice, p.currency AS pCurrency, p.brand, p.unit, p.notes,
            p.category_id AS pCategoryId, cat.name AS pCategoryName,
            (SELECT TOP 1 id FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageId,
            (SELECT TOP 1 base64_data FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageData,
            (SELECT TOP 1 mime_type FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageMime
     FROM catalog_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN categories cat ON cat.id = p.category_id
     WHERE ci.catalog_id = @catalogId
     ORDER BY ci.sort_order`);

  const custR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, id)
    .query(`SELECT cc.id, cc.customer_id AS customerId, cc.created_at AS createdAt,
            c.id AS cId, c.name AS cName, c.contact_name AS contactName, c.email, c.phone
     FROM catalog_customers cc
     JOIN customers c ON c.id = cc.customer_id
     WHERE cc.catalog_id = @catalogId
     ORDER BY c.name`);

  const fcR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, id)
    .query(`SELECT field_name AS fieldName, is_visible AS isVisible, sort_order AS sortOrder
     FROM catalog_field_config WHERE catalog_id = @catalogId ORDER BY sort_order`);

  const items: CatalogItemDTO[] = itemsR.recordset.map((r) => ({
    id: r.id,
    productId: r.productId,
    sortOrder: r.sortOrder,
    customPrice: r.customPrice ? Number(r.customPrice) : null,
    customNotes: r.customNotes,
    product: {
      id: r.pId,
      sku: r.sku,
      name: r.pName,
      description: r.pDescription,
      price: Number(r.pPrice),
      currency: r.pCurrency,
      category: r.pCategoryId ? { id: r.pCategoryId, name: r.pCategoryName! } : null,
      brand: r.brand,
      unit: r.unit,
      notes: r.notes,
      primaryImage: r.primaryImageData
        ? { base64Data: r.primaryImageData, mimeType: r.primaryImageMime! }
        : null,
    },
  }));

  const customers: CatalogCustomerDTO[] = custR.recordset.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customer: { id: r.cId, name: r.cName, contactName: r.contactName, email: r.email, phone: r.phone },
    createdAt: r.createdAt.toISOString(),
  }));

  const fieldConfig = fcR.recordset.length > 0
    ? fcR.recordset.map((f) => ({ fieldName: f.fieldName, isVisible: f.isVisible, sortOrder: f.sortOrder }))
    : CATALOG_FIELD_NAMES.map((name, i) => ({ fieldName: name, isVisible: true, sortOrder: i }));

  return {
    id: catalog.id,
    tenantId: catalog.tenantId,
    name: catalog.name,
    description: catalog.description,
    status: catalog.status,
    createdBy: catalog.createdBy,
    createdAt: catalog.createdAt.toISOString(),
    updatedAt: catalog.updatedAt.toISOString(),
    items,
    customers,
    fieldConfig,
  };
};

// === Create ===

export const createCatalog = async (
  tenantId: string,
  userId: string,
  input: CatalogInput,
): Promise<CatalogDetailDTO> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('createdBy', sql.UniqueIdentifier, userId)
    .input('name', sql.NVarChar, input.name)
    .input('description', sql.NVarChar, input.description ?? null)
    .input('status', sql.NVarChar, input.status ?? 'draft')
    .query(`INSERT INTO catalogs (tenant_id, name, description, status, created_by)
            OUTPUT INSERTED.id
            VALUES (@tenantId, @name, @description, @status, @createdBy)`);
  const catalogId = r.recordset[0].id;

  // Default field config: 10 alan visible, sort_order = array index
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (let i = 0; i < CATALOG_FIELD_NAMES.length; i++) {
      await tx.request()
        .input('catalogId', sql.UniqueIdentifier, catalogId)
        .input('fieldName', sql.NVarChar, CATALOG_FIELD_NAMES[i])
        .input('isVisible', sql.Bit, true)
        .input('sortOrder', sql.Int, i)
        .query(`INSERT INTO catalog_field_config (catalog_id, field_name, is_visible, sort_order)
                VALUES (@catalogId, @fieldName, @isVisible, @sortOrder)`);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  return getCatalog(tenantId, catalogId);
};

// === Update ===

export const updateCatalog = async (
  tenantId: string,
  id: string,
  input: Partial<CatalogInput>,
): Promise<CatalogDetailDTO> => {
  const pool = await getPool();
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT id FROM catalogs WHERE id = @id AND tenant_id = @tenantId`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Katalog bulunamadi');

  await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, input.name ?? null)
    .input('description', sql.NVarChar, input.description ?? null)
    .input('status', sql.NVarChar, input.status ?? null)
    .query(`UPDATE catalogs
            SET name = COALESCE(@name, name),
                description = COALESCE(@description, description),
                status = COALESCE(@status, status),
                updated_at = getdate()
            WHERE id = @id AND tenant_id = @tenantId`);
  return getCatalog(tenantId, id);
};

// === Delete (CASCADE handled by FK) ===

export const deleteCatalog = async (tenantId: string, id: string): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`DELETE FROM catalogs WHERE id = @id AND tenant_id = @tenantId`);
  if (r.rowsAffected[0] === 0) throw new HttpError(404, 'Katalog bulunamadi');
};

// === Items ===

export const addItem = async (
  tenantId: string,
  catalogId: string,
  input: CatalogItemInput,
): Promise<CatalogItemDTO> => {
  const pool = await getPool();
  // Katalog var mi ve tenant'a mi ait?
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id FROM catalogs WHERE id = @id AND tenant_id = @tenantId`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Katalog bulunamadi');

  // max sort_order + 1, ya da input.sortOrder
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const maxR = await pool.request()
      .input('catalogId', sql.UniqueIdentifier, catalogId)
      .query(`SELECT ISNULL(MAX(sort_order), -1) + 1 AS nextSort FROM catalog_items WHERE catalog_id = @catalogId`);
    sortOrder = maxR.recordset[0].nextSort;
  }

  const r = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .input('productId', sql.UniqueIdentifier, input.productId)
    .input('sortOrder', sql.Int, sortOrder)
    .input('customPrice', sql.Decimal(12, 2),
      input.customPrice !== undefined && input.customPrice !== null ? String(input.customPrice) : null)
    .input('customNotes', sql.NVarChar, input.customNotes ?? null)
    .query(`INSERT INTO catalog_items (catalog_id, product_id, sort_order, custom_price, custom_notes)
            OUTPUT INSERTED.id
            VALUES (@catalogId, @productId, @sortOrder, @customPrice, @customNotes)`);
  const itemId = r.recordset[0].id;

  // Touch catalog updated_at
  await pool.request()
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`UPDATE catalogs SET updated_at = getdate() WHERE id = @id`);

  // Return full DTO
  const itemR = await pool.request()
    .input('id', sql.UniqueIdentifier, itemId)
    .query(`SELECT ci.id, ci.product_id AS productId, ci.sort_order AS sortOrder,
            ci.custom_price AS customPrice, ci.custom_notes AS customNotes,
            p.id AS pId, p.sku, p.name AS pName, p.description AS pDescription,
            CAST(p.price AS VARCHAR) AS pPrice, p.currency AS pCurrency, p.brand, p.unit, p.notes,
            p.category_id AS pCategoryId, cat.name AS pCategoryName,
            (SELECT TOP 1 base64_data FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageData,
            (SELECT TOP 1 mime_type FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageMime
     FROM catalog_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN categories cat ON cat.id = p.category_id
     WHERE ci.id = @id`);
  const r2 = itemR.recordset[0];
  if (!r2) throw new HttpError(500, 'Eklenen urun hemen okunamadi');
  return {
    id: r2.id,
    productId: r2.productId,
    sortOrder: r2.sortOrder,
    customPrice: r2.customPrice ? Number(r2.customPrice) : null,
    customNotes: r2.customNotes,
    product: {
      id: r2.pId,
      sku: r2.sku,
      name: r2.pName,
      description: r2.pDescription,
      price: Number(r2.pPrice),
      currency: r2.pCurrency,
      category: r2.pCategoryId ? { id: r2.pCategoryId, name: r2.pCategoryName! } : null,
      brand: r2.brand,
      unit: r2.unit,
      notes: r2.notes,
      primaryImage: r2.primaryImageData
        ? { base64Data: r2.primaryImageData, mimeType: r2.primaryImageMime! }
        : null,
    },
  };
};

export const removeItem = async (tenantId: string, catalogId: string, itemId: string): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .input('itemId', sql.UniqueIdentifier, itemId)
    .query(`DELETE ci
            FROM catalog_items ci
            JOIN catalogs c ON c.id = ci.catalog_id
            WHERE ci.id = @itemId AND ci.catalog_id = @catalogId AND c.tenant_id = @tenantId`);
  if (r.rowsAffected[0] === 0) throw new HttpError(404, 'Urun bulunamadi');
  await pool.request()
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`UPDATE catalogs SET updated_at = getdate() WHERE id = @id`);
};

// === Customers ===

export const assignCustomers = async (
  tenantId: string,
  catalogId: string,
  customerIds: string[],
): Promise<{ added: number; skipped: number }> => {
  const pool = await getPool();
  // Katalog var mi?
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id FROM catalogs WHERE id = @id AND tenant_id = @tenantId`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Katalog bulunamadi');

  // Mevcut atamalari cek
  const existingR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .query(`SELECT customer_id FROM catalog_customers WHERE catalog_id = @catalogId`);
  const existing = new Set<string>(existingR.recordset.map((r) => r.customer_id as string));

  let added = 0;
  let skipped = 0;
  for (const customerId of customerIds) {
    if (existing.has(customerId)) {
      skipped++;
      continue;
    }
    await pool.request()
      .input('catalogId', sql.UniqueIdentifier, catalogId)
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(`INSERT INTO catalog_customers (catalog_id, customer_id) VALUES (@catalogId, @customerId)`);
    added++;
    existing.add(customerId);
  }

  if (added > 0) {
    await pool.request()
      .input('id', sql.UniqueIdentifier, catalogId)
      .query(`UPDATE catalogs SET updated_at = getdate() WHERE id = @id`);
  }
  return { added, skipped };
};

export const removeCustomer = async (
  tenantId: string,
  catalogId: string,
  customerId: string,
): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .input('customerId', sql.UniqueIdentifier, customerId)
    .query(`DELETE cc
            FROM catalog_customers cc
            JOIN catalogs c ON c.id = cc.catalog_id
            WHERE cc.customer_id = @customerId AND cc.catalog_id = @catalogId AND c.tenant_id = @tenantId`);
  if (r.rowsAffected[0] === 0) throw new HttpError(404, 'Musteri atamasi bulunamadi');
  await pool.request()
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`UPDATE catalogs SET updated_at = getdate() WHERE id = @id`);
};

// === Field config ===

export const updateFieldConfig = async (
  tenantId: string,
  catalogId: string,
  fields: FieldConfigInput[],
): Promise<FieldConfigInput[]> => {
  const pool = await getPool();
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`SELECT id FROM catalogs WHERE id = @id AND tenant_id = @tenantId`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Katalog bulunamadi');

  // REPLACE: DELETE + INSERT (transaction ile atomik)
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request()
      .input('catalogId', sql.UniqueIdentifier, catalogId)
      .query(`DELETE FROM catalog_field_config WHERE catalog_id = @catalogId`);
    for (const f of fields) {
      await tx.request()
        .input('catalogId', sql.UniqueIdentifier, catalogId)
        .input('fieldName', sql.NVarChar, f.fieldName)
        .input('isVisible', sql.Bit, f.isVisible)
        .input('sortOrder', sql.Int, f.sortOrder)
        .query(`INSERT INTO catalog_field_config (catalog_id, field_name, is_visible, sort_order)
                VALUES (@catalogId, @fieldName, @isVisible, @sortOrder)`);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  await pool.request()
    .input('id', sql.UniqueIdentifier, catalogId)
    .query(`UPDATE catalogs SET updated_at = getdate() WHERE id = @id`);
  return fields;
};

// === Filter products for catalog wizard ===

export interface CatalogWizardProductDTO {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency: string;
  category: { id: string; name: string } | null;
  brand: string | null;
  unit: string | null;
  primaryImage: { base64Data: string; mimeType: string } | null;
  inCurrentCatalog: boolean;
}

export const filterProductsForCatalog = async (
  tenantId: string,
  catalogId: string,
  options: {
    search?: string;
    categoryId?: string;
    brand?: string;
    priceMin?: number;
    priceMax?: number;
    excludeInCatalog?: boolean;
    limit?: number;
  },
): Promise<CatalogWizardProductDTO[]> => {
  const pool = await getPool();
  const limit = options.limit ?? 50;

  let where = 'p.tenant_id = @tenantId AND p.is_active = 1';
  if (options.search) where += ` AND (LOWER(p.name) LIKE @search OR LOWER(p.sku) LIKE @search)`;
  if (options.categoryId) where += ' AND p.category_id = @categoryId';
  if (options.brand) where += ` AND LOWER(p.brand) LIKE @brand`;
  if (options.priceMin !== undefined) where += ' AND p.price >= @priceMin';
  if (options.priceMax !== undefined) where += ' AND p.price <= @priceMax';
  let excludeClause = '';
  if (options.excludeInCatalog) {
    excludeClause = ` AND NOT EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.product_id = p.id AND ci.catalog_id = @catalogId)`;
  }

  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('catalogId', sql.UniqueIdentifier, catalogId)
    .input('search', sql.NVarChar, options.search ? `%${options.search.toLowerCase()}%` : '')
    .input('categoryId', sql.UniqueIdentifier, options.categoryId ?? null)
    .input('brand', sql.NVarChar, options.brand ? `%${options.brand.toLowerCase()}%` : '')
    .input('priceMin', sql.Decimal(12, 2), options.priceMin ?? null)
    .input('priceMax', sql.Decimal(12, 2), options.priceMax ?? null)
    .input('limit', sql.Int, limit)
    .query(`SELECT p.id, p.sku, p.name, CAST(p.price AS VARCHAR) AS price, p.currency,
            p.brand, p.unit, p.category_id AS categoryId, cat.name AS categoryName,
            (SELECT TOP 1 base64_data FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageData,
            (SELECT TOP 1 mime_type FROM product_images WHERE product_id = p.id AND is_primary = 1) AS primaryImageMime,
            CASE WHEN EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.product_id = p.id AND ci.catalog_id = @catalogId) THEN 1 ELSE 0 END AS inCurrentCatalog
     FROM products p
     LEFT JOIN categories cat ON cat.id = p.category_id
     WHERE ${where} ${excludeClause}
     ORDER BY p.name
     OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`);

  return r.recordset.map((r2) => ({
    id: r2.id,
    sku: r2.sku,
    name: r2.name,
    price: Number(r2.price),
    currency: r2.currency,
    category: r2.categoryId ? { id: r2.categoryId, name: r2.categoryName! } : null,
    brand: r2.brand,
    unit: r2.unit,
    primaryImage: r2.primaryImageData
      ? { base64Data: r2.primaryImageData, mimeType: r2.primaryImageMime! }
      : null,
    inCurrentCatalog: Boolean(r2.inCurrentCatalog),
  }));
};

logger.info('catalog.service.ts (raw mssql, write tarafi) yuklendi');