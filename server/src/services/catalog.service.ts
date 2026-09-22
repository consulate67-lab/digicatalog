import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Catalog service. Minimal raw mssql versiyonu (Drizzle ORM'den gecildi).
 *
 * Sadece list + get implement edilmis (demo ve viewer icin yeterli).
 * Create/update/delete/customer/items/field-config: TODO (ileride eklenebilir).
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

const CATALOG_FIELD_NAMES = ['sku', 'name', 'description', 'price', 'currency', 'category', 'brand', 'unit', 'notes', 'images'] as const;

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
    .query(`SELECT COUNT(*) AS total FROM catalogs c WHERE ${where.replace(/@(\w+)/g, '@$1')}`);
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

  // Items + product + image
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

  // Customers
  const custR = await pool.request()
    .input('catalogId', sql.UniqueIdentifier, id)
    .query(`SELECT cc.id, cc.customer_id AS customerId, cc.created_at AS createdAt,
            c.id AS cId, c.name AS cName, c.contact_name AS contactName, c.email, c.phone
     FROM catalog_customers cc
     JOIN customers c ON c.id = cc.customer_id
     WHERE cc.catalog_id = @catalogId
     ORDER BY c.name`);

  // Field config
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

// === Stub'lar (ileride implement edilecek) ===

export const createCatalog = async (): Promise<never> => {
  throw new HttpError(501, 'createCatalog henuz implement edilmedi');
};
export const updateCatalog = async (): Promise<never> => {
  throw new HttpError(501, 'updateCatalog henuz implement edilmedi');
};
export const deleteCatalog = async (): Promise<never> => {
  throw new HttpError(501, 'deleteCatalog henuz implement edilmedi');
};
export const addCatalogItem = async (): Promise<never> => {
  throw new HttpError(501, 'addCatalogItem henuz implement edilmedi');
};
export const removeCatalogItem = async (): Promise<never> => {
  throw new HttpError(501, 'removeCatalogItem henuz implement edilmedi');
};
export const assignCatalogCustomers = async (): Promise<never> => {
  throw new HttpError(501, 'assignCatalogCustomers henuz implement edilmedi');
};
export const updateFieldConfig = async (): Promise<never> => {
  throw new HttpError(501, 'updateFieldConfig henuz implement edilmedi');
};

logger.info('catalog.service.ts (raw mssql, minimal) yuklendi');