import sql from 'mssql';
import { getPool } from '../config/database';
import { tenantFilter } from '../db/helpers';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Product service. Urun CRUD + resim yonetimi + filtreleme/arama.
 *
 * NOT: Drizzle ORM'den raw mssql'e gecildi (drizzle-orm'de MSSEL exports yok).
 * numeric/decimal MSSEL'den string gelir, parseFloat ile number'a cevrilir.
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_BASE64_LENGTH = 15_000_000;

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const validateImage = (data: { base64Data: string; mimeType: string; fileSize: number }): void => {
  if (!ALLOWED_IMAGE_MIMES.includes(data.mimeType as never)) {
    throw new HttpError(400, `Desteklenmeyen resim formati: ${data.mimeType}`);
  }
  if (data.fileSize > MAX_BASE64_LENGTH) {
    throw new HttpError(413, `Resim cok buyuk (max ${MAX_BASE64_LENGTH / 1_000_000}MB)`);
  }
};

export interface ProductDTO {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  brand: string | null;
  unit: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  imageCount: number;
  primaryImage: { id: string; base64Data: string; mimeType: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetailDTO extends ProductDTO {
  images: Array<{
    id: string;
    base64Data: string;
    mimeType: string;
    sortOrder: number;
    isPrimary: boolean;
    fileSize: number;
    createdAt: string;
  }>;
}

interface RawProductRow {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  categoryId: string | null;
  brand: string | null;
  unit: string | null;
  notes: string | null;
  attributes: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  catId: string | null;
  catName: string | null;
  catSlug: string | null;
}

const toProductDTO = (row: RawProductRow, primaryImage: { id: string; base64Data: string; mimeType: string } | null, imageCount: number): ProductDTO => ({
  id: row.id,
  tenantId: row.tenantId,
  sku: row.sku,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  currency: row.currency,
  categoryId: row.categoryId,
  category: row.catId ? { id: row.catId, name: row.catName!, slug: row.catSlug! } : null,
  brand: row.brand,
  unit: row.unit,
  notes: row.notes,
  attributes: row.attributes ? JSON.parse(row.attributes) : {},
  sortOrder: row.sortOrder,
  isActive: row.isActive,
  imageCount,
  primaryImage,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const PRODUCT_SELECT = `
  p.id, p.tenant_id AS tenantId, p.sku, p.name, p.description, CAST(p.price AS VARCHAR) AS price,
  p.currency, p.category_id AS categoryId, p.brand, p.unit, p.notes, p.attributes,
  p.sort_order AS sortOrder, p.is_active AS isActive,
  p.created_at AS createdAt, p.updated_at AS updatedAt,
  c.id AS catId, c.name AS catName, c.slug AS catSlug
`;

export interface ListProductsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  isActive?: boolean;
  sort?: 'sortOrder' | 'name' | 'price' | 'createdAt' | 'updatedAt';
  order?: 'asc' | 'desc';
}

export const listProducts = async (
  tenantId: string,
  options: ListProductsOptions = {},
): Promise<{ items: ProductDTO[]; total: number }> => {
  const pool = await getPool();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  let where = 'p.tenant_id = @tenantId';
  if (options.isActive !== undefined) where += ' AND p.is_active = @isActive';
  else where += ' AND p.is_active = 1';
  if (options.search) {
    where += ` AND (LOWER(p.name) LIKE @search OR LOWER(p.sku) LIKE @search)`;
  }
  if (options.categoryId) {
    where += ' AND p.category_id = @categoryId';
  }
  if (options.brand) {
    where += ' AND LOWER(p.brand) LIKE @brand';
  }
  if (options.priceMin !== undefined) where += ' AND p.price >= @priceMin';
  if (options.priceMax !== undefined) where += ' AND p.price <= @priceMax';

  const sortCol = {
    sortOrder: 'p.sort_order',
    name: 'p.name',
    price: 'p.price',
    createdAt: 'p.created_at',
    updatedAt: 'p.updated_at',
  }[options.sort ?? 'sortOrder'];
  const sortDir = options.order === 'desc' ? 'DESC' : 'ASC';

  const req = pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('search', sql.NVarChar, options.search ? `%${options.search.toLowerCase()}%` : '')
    .input('categoryId', sql.UniqueIdentifier, options.categoryId ?? null)
    .input('brand', sql.NVarChar, options.brand ? `%${options.brand.toLowerCase()}%` : '')
    .input('priceMin', sql.Decimal(12, 2), options.priceMin ?? null)
    .input('priceMax', sql.Decimal(12, 2), options.priceMax ?? null)
    .input('isActive', sql.Bit, options.isActive ?? true)
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize);

  const itemsR = await req.query(`
    SELECT ${PRODUCT_SELECT}
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where}
    ORDER BY ${sortCol} ${sortDir}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);

  // total count
  const totalReq = pool.request().input('tenantId', sql.UniqueIdentifier, tenantId);
  if (options.search) totalReq.input('search', sql.NVarChar, `%${options.search.toLowerCase()}%`);
  if (options.categoryId) totalReq.input('categoryId', sql.UniqueIdentifier, options.categoryId);
  if (options.brand) totalReq.input('brand', sql.NVarChar, `%${options.brand.toLowerCase()}%`);
  if (options.priceMin !== undefined) totalReq.input('priceMin', sql.Decimal(12, 2), options.priceMin);
  if (options.priceMax !== undefined) totalReq.input('priceMax', sql.Decimal(12, 2), options.priceMax);
  if (options.isActive !== undefined) totalReq.input('isActive', sql.Bit, options.isActive);
  const totalR = await totalReq.query(`SELECT COUNT(*) AS total FROM products p WHERE ${where.replace(/@(\w+)/g, '@$1')}`);
  const total = totalR.recordset[0]?.total ?? 0;

  // imageCount + primaryImage (per-product query; N+1 tolere ediliyor — pageSize max 100)
  const productIds = itemsR.recordset.map((r) => r.id);
  const imageMap = new Map<string, { count: number; primary: { id: string; base64Data: string; mimeType: string } | null }>();
  for (const pid of productIds) {
    const cntR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('pid', sql.UniqueIdentifier, pid)
      .query(`SELECT COUNT(*) AS c FROM product_images WHERE tenant_id = @tenantId AND product_id = @pid`);
    const primR = await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('pid', sql.UniqueIdentifier, pid)
      .query(`SELECT TOP 1 id, base64_data AS base64Data, mime_type AS mimeType
              FROM product_images
              WHERE tenant_id = @tenantId AND product_id = @pid AND is_primary = 1
              ORDER BY sort_order ASC`);
    imageMap.set(pid, { count: cntR.recordset[0]?.c ?? 0, primary: primR.recordset[0] ?? null });
  }

  const items = itemsR.recordset.map((r) => {
    const im = imageMap.get(r.id) ?? { count: 0, primary: null };
    return toProductDTO(r, im.primary, im.count);
  });

  return { items, total };
};

export const getProduct = async (tenantId: string, id: string): Promise<ProductDetailDTO> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT ${PRODUCT_SELECT}
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.id = @id AND p.tenant_id = @tenantId`);
  const row = r.recordset[0];
  if (!row) throw new HttpError(404, 'Urun bulunamadi');

  const imgsR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('pid', sql.UniqueIdentifier, id)
    .query(`SELECT id, base64_data AS base64Data, mime_type AS mimeType, sort_order AS sortOrder,
            is_primary AS isPrimary, file_size AS fileSize, created_at AS createdAt
     FROM product_images WHERE tenant_id = @tenantId AND product_id = @pid ORDER BY sort_order ASC, created_at ASC`);

  const primary = imgsR.recordset.find((i) => i.isPrimary) ?? imgsR.recordset[0] ?? null;
  const dto = toProductDTO(row, primary ? { id: primary.id, base64Data: primary.base64Data, mimeType: primary.mimeType } : null, imgsR.recordset.length);
  return {
    ...dto,
    images: imgsR.recordset.map((i) => ({
      id: i.id,
      base64Data: i.base64Data,
      mimeType: i.mimeType,
      sortOrder: i.sortOrder,
      isPrimary: i.isPrimary,
      fileSize: i.fileSize,
      createdAt: i.createdAt.toISOString(),
    })),
  };
};

export interface ProductInput {
  sku: string;
  name: string;
  description?: string | null;
  price: number;
  currency?: 'TRY' | 'USD' | 'EUR' | 'GBP';
  categoryId?: string | null;
  brand?: string | null;
  unit?: string | null;
  notes?: string | null;
  attributes?: Record<string, unknown>;
  sortOrder?: number;
  isActive?: boolean;
}

export const createProduct = async (tenantId: string, input: ProductInput): Promise<ProductDTO> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('sku', sql.NVarChar, input.sku)
    .input('name', sql.NVarChar, input.name)
    .input('description', sql.NVarChar, input.description ?? null)
    .input('price', sql.Decimal(12, 2), String(input.price))
    .input('currency', sql.NVarChar, input.currency ?? 'TRY')
    .input('categoryId', sql.UniqueIdentifier, input.categoryId ?? null)
    .input('brand', sql.NVarChar, input.brand ?? null)
    .input('unit', sql.NVarChar, input.unit ?? null)
    .input('notes', sql.NVarChar, input.notes ?? null)
    .input('attributes', sql.NVarChar, JSON.stringify(input.attributes ?? {}))
    .input('sortOrder', sql.Int, input.sortOrder ?? 0)
    .input('isActive', sql.Bit, input.isActive ?? true)
    .query(`INSERT INTO products (tenant_id, sku, name, description, price, currency, category_id, brand, unit, notes, attributes, sort_order, is_active)
            OUTPUT INSERTED.id
            VALUES (@tenantId, @sku, @name, @description, @price, @currency, @categoryId, @brand, @unit, @notes, @attributes, @sortOrder, @isActive)`);
  const id = r.recordset[0].id;
  return (await getProduct(tenantId, id)) as ProductDTO;
};

export const updateProduct = async (
  tenantId: string,
  id: string,
  input: Partial<ProductInput>,
): Promise<ProductDTO> => {
  const pool = await getPool();
  // Mevcut urun var mi
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT id FROM products WHERE id = @id AND tenant_id = @tenantId`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Urun bulunamadi');

  await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, input.name ?? null)
    .input('description', sql.NVarChar, input.description ?? null)
    .input('price', sql.Decimal(12, 2), input.price !== undefined ? String(input.price) : null)
    .input('currency', sql.NVarChar, input.currency ?? null)
    .input('categoryId', sql.UniqueIdentifier, input.categoryId !== undefined ? input.categoryId : null)
    .input('brand', sql.NVarChar, input.brand ?? null)
    .input('unit', sql.NVarChar, input.unit ?? null)
    .input('notes', sql.NVarChar, input.notes ?? null)
    .input('attributes', sql.NVarChar, input.attributes ? JSON.stringify(input.attributes) : null)
    .input('sortOrder', sql.Int, input.sortOrder ?? null)
    .input('isActive', sql.Bit, input.isActive ?? null)
    .query(`UPDATE products
            SET name = COALESCE(@name, name),
                description = COALESCE(@description, description),
                price = COALESCE(@price, price),
                currency = COALESCE(@currency, currency),
                category_id = COALESCE(@categoryId, category_id),
                brand = COALESCE(@brand, brand),
                unit = COALESCE(@unit, unit),
                notes = COALESCE(@notes, notes),
                attributes = COALESCE(@attributes, attributes),
                sort_order = COALESCE(@sortOrder, sort_order),
                is_active = COALESCE(@isActive, is_active),
                updated_at = getdate()
            WHERE id = @id AND tenant_id = @tenantId`);
  return (await getProduct(tenantId, id)) as ProductDTO;
};

export const deleteProduct = async (tenantId: string, id: string): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`DELETE FROM products WHERE id = @id AND tenant_id = @tenantId`);
  if (r.rowsAffected[0] === 0) throw new HttpError(404, 'Urun bulunamadi');
};

export interface ImageInput {
  base64Data: string;
  mimeType: string;
  fileSize: number;
  isPrimary?: boolean;
  sortOrder?: number;
}

export const addProductImage = async (
  tenantId: string,
  productId: string,
  input: ImageInput,
): Promise<{ id: string }> => {
  validateImage(input);
  const pool = await getPool();

  // Ürün var mı
  const ex = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('productId', sql.UniqueIdentifier, productId)
    .query(`SELECT id FROM products WHERE id = @productId AND tenant_id = @tenantId`);
  if (!ex.recordset[0]) throw new HttpError(404, 'Urun bulunamadi');

  // is_primary true ise digerlerini false yap
  if (input.isPrimary) {
    await pool.request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('productId', sql.UniqueIdentifier, productId)
      .query(`UPDATE product_images SET is_primary = 0 WHERE tenant_id = @tenantId AND product_id = @productId`);
  }

  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('productId', sql.UniqueIdentifier, productId)
    .input('base64Data', sql.NVarChar, input.base64Data)
    .input('mimeType', sql.NVarChar, input.mimeType)
    .input('fileSize', sql.Int, input.fileSize)
    .input('isPrimary', sql.Bit, input.isPrimary ?? false)
    .input('sortOrder', sql.Int, input.sortOrder ?? 0)
    .query(`INSERT INTO product_images (tenant_id, product_id, base64_data, mime_type, file_size, is_primary, sort_order)
            OUTPUT INSERTED.id
            VALUES (@tenantId, @productId, @base64Data, @mimeType, @fileSize, @isPrimary, @sortOrder)`);
  return { id: r.recordset[0].id };
};

export const deleteProductImage = async (
  tenantId: string,
  productId: string,
  imageId: string,
): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('productId', sql.UniqueIdentifier, productId)
    .input('imageId', sql.UniqueIdentifier, imageId)
    .query(`DELETE FROM product_images WHERE id = @imageId AND product_id = @productId AND tenant_id = @tenantId`);
  if (r.rowsAffected[0] === 0) throw new HttpError(404, 'Resim bulunamadi');
};

logger.info('product.service.ts (raw mssql) yuklendi');