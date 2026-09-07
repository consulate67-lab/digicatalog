import { eq, and, or, ilike, desc, asc, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database';
import {
  products,
  productImages,
  categories,
  type Product,
  type ProductImage,
  type NewProduct,
  type NewProductImage,
} from '../db/schema';
import { withTenant, tenantAnd } from '../db/helpers';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Product service. Ürün CRUD + resim yönetimi + filtreleme/arama.
 *
 * Tüm query'ler withTenant(products, tenantId) ile izole.
 * numeric price Drizzle'dan string gelir, burada number'a çevrilir.
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_BASE64_LENGTH = 15_000_000; // ~10MB binary

// === Image validation ===

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const validateImage = (data: {
  base64Data: string;
  mimeType: string;
  fileSize: number;
}): void => {
  if (!ALLOWED_IMAGE_MIMES.includes(data.mimeType as never)) {
    throw new HttpError(400, `Desteklenmeyen resim formatı: ${data.mimeType}`);
  }
  if (data.fileSize > MAX_BASE64_LENGTH) {
    throw new HttpError(413, `Resim çok büyük (max ${MAX_BASE64_LENGTH / 1_000_000}MB)`);
  }
  if (!data.base64Data.startsWith('data:') && !/^[A-Za-z0-9+/=]+$/.test(data.base64Data)) {
    throw new HttpError(400, 'Geçersiz base64 formatı');
  }
};

// === Public DTO ===

export interface ProductDTO {
  id: string;
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

const toProductDTO = (row: Product, primaryImage: ProductImage | null, imageCount: number, category: { id: string; name: string; slug: string } | null): ProductDTO => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  currency: row.currency,
  categoryId: row.categoryId,
  category,
  brand: row.brand,
  unit: row.unit,
  notes: row.notes,
  attributes: row.attributes ?? {},
  sortOrder: row.sortOrder,
  isActive: row.isActive,
  imageCount,
  primaryImage: primaryImage
    ? { id: primaryImage.id, base64Data: primaryImage.base64Data, mimeType: primaryImage.mimeType }
    : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

// === List ===

export interface ListProductsOptions {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brand?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'price' | 'createdAt' | 'sortOrder';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const listProducts = async (
  tenantId: string,
  options: ListProductsOptions = {},
): Promise<PaginatedResponse<ProductDTO>> => {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;

  // === Build WHERE conditions ===
  const conditions: (SQL | undefined)[] = [withTenant(products, tenantId)];

  if (options.search) {
    const term = `%${options.search}%`;
    conditions.push(
      or(
        ilike(products.name, term),
        ilike(products.sku, term),
        ilike(products.description, term),
      ),
    );
  }
  if (options.categoryId) {
    conditions.push(eq(products.categoryId, options.categoryId));
  }
  if (options.brand) {
    conditions.push(ilike(products.brand, options.brand));
  }
  if (typeof options.isActive === 'boolean') {
    conditions.push(eq(products.isActive, options.isActive));
  }

  // === Build ORDER BY ===
  const sortBy = options.sortBy ?? 'sortOrder';
  const sortOrder = options.sortOrder ?? 'asc';
  const orderColumn = {
    name: products.name,
    price: products.price,
    createdAt: products.createdAt,
    sortOrder: products.sortOrder,
  }[sortBy];
  const orderFn = sortOrder === 'asc' ? asc : desc;

  // === Total count ===
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(tenantAnd(products, tenantId, ...conditions));

  // === Data query with category + primary image ===
  const rows = await db
    .select({
      product: products,
      category: { id: categories.id, name: categories.name, slug: categories.slug },
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(tenantAnd(products, tenantId, ...conditions))
    .orderBy(orderFn(orderColumn), asc(products.id))
    .limit(limit)
    .offset(offset);

  // === Image counts + primary image lookup ===
  // N+1 query (Faz 2.4'te optimizasyon): her ürün için ayrı sorgu
  // Şimdilik kabul edilebilir (20-50 ürün/sayfa). İleride JOIN ile.
  const productIds = rows.map((r) => r.product.id);
  const imageMap = new Map<string, { count: number; primary: ProductImage | null }>();

  if (productIds.length > 0) {
    const images = await db
      .select()
      .from(productImages)
      .where(sql`${productImages.productId} = ANY(${productIds})`);
    for (const img of images) {
      const existing = imageMap.get(img.productId) ?? { count: 0, primary: null };
      existing.count += 1;
      if (img.isPrimary) existing.primary = img;
      else if (!existing.primary && img.sortOrder === 0) existing.primary = img;
      imageMap.set(img.productId, existing);
    }
  }

  const data = rows.map((r) => {
    const imgInfo = imageMap.get(r.product.id) ?? { count: 0, primary: null };
    return toProductDTO(r.product, imgInfo.primary, imgInfo.count, r.category);
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  };
};

// === Get one ===

export const getProduct = async (tenantId: string, id: string): Promise<ProductDetailDTO> => {
  const [row] = await db
    .select({
      product: products,
      category: { id: categories.id, name: categories.name, slug: categories.slug },
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, id), withTenant(products, tenantId)))
    .limit(1);

  if (!row) throw new HttpError(404, 'Ürün bulunamadı');

  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, id))
    .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));

  const primary = images.find((i) => i.isPrimary) ?? images[0] ?? null;

  return {
    ...toProductDTO(row.product, primary, images.length, row.category),
    images: images.map((img) => ({
      id: img.id,
      base64Data: img.base64Data,
      mimeType: img.mimeType,
      sortOrder: img.sortOrder,
      isPrimary: img.isPrimary,
      fileSize: img.fileSize,
      createdAt: img.createdAt.toISOString(),
    })),
  };
};

// === Create ===

export interface ProductInput {
  sku: string;
  name: string;
  description?: string | null;
  price?: number;
  currency?: 'TRY' | 'USD' | 'EUR' | 'GBP';
  categoryId?: string | null;
  brand?: string | null;
  unit?: string | null;
  notes?: string | null;
  attributes?: Record<string, unknown>;
  sortOrder?: number;
  isActive?: boolean;
}

const ensureUniqueSku = async (tenantId: string, sku: string, excludeId?: string): Promise<void> => {
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.sku, sku)))
    .limit(1);
  if (existing.length > 0 && existing[0].id !== excludeId) {
    throw new HttpError(409, 'Bu SKU zaten kullanılıyor');
  }
};

const ensureCategoryExists = async (
  tenantId: string,
  categoryId: string,
): Promise<void> => {
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), withTenant(categories, tenantId)))
    .limit(1);
  if (!cat) throw new HttpError(404, 'Kategori bulunamadı');
};

export const createProduct = async (tenantId: string, input: ProductInput): Promise<ProductDetailDTO> => {
  await ensureUniqueSku(tenantId, input.sku);
  if (input.categoryId) await ensureCategoryExists(tenantId, input.categoryId);

  const insertData: NewProduct = {
    tenantId,
    sku: input.sku,
    name: input.name,
    description: input.description ?? null,
    price: String(input.price ?? 0),
    currency: input.currency ?? 'TRY',
    categoryId: input.categoryId ?? null,
    brand: input.brand ?? null,
    unit: input.unit ?? null,
    notes: input.notes ?? null,
    attributes: input.attributes ?? {},
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };

  const [created] = await db.insert(products).values(insertData).returning();
  logger.info({ productId: created.id, sku: created.sku, tenantId }, 'Product created');

  return getProduct(tenantId, created.id);
};

// === Update ===

export const updateProduct = async (
  tenantId: string,
  id: string,
  input: Partial<ProductInput>,
): Promise<ProductDetailDTO> => {
  const existing = await getProduct(tenantId, id);
  if (input.sku && input.sku !== existing.sku) {
    await ensureUniqueSku(tenantId, input.sku, id);
  }
  if (input.categoryId && input.categoryId !== existing.categoryId) {
    await ensureCategoryExists(tenantId, input.categoryId);
  }

  const updateData: Partial<NewProduct> = {
    sku: input.sku,
    name: input.name,
    description: input.description,
    price: input.price !== undefined ? String(input.price) : undefined,
    currency: input.currency,
    categoryId: input.categoryId,
    brand: input.brand,
    unit: input.unit,
    notes: input.notes,
    attributes: input.attributes,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    updatedAt: new Date(),
  };

  await db
    .update(products)
    .set(updateData)
    .where(and(eq(products.id, id), withTenant(products, tenantId)));

  return getProduct(tenantId, id);
};

// === Delete ===

export const deleteProduct = async (tenantId: string, id: string): Promise<void> => {
  const result = await db
    .delete(products)
    .where(and(eq(products.id, id), withTenant(products, tenantId)))
    .returning({ id: products.id });
  if (result.length === 0) throw new HttpError(404, 'Ürün bulunamadı');
  logger.info({ productId: id, tenantId }, 'Product deleted');
};

// === Image management ===

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
): Promise<ProductImage> => {
  // Product var mı ve tenant'a mı ait? (getProduct 404 fırlatır yoksa)
  await getProduct(tenantId, productId);

  validateImage(input);

  // Eğer bu primary olacaksa, diğerlerinin primary'sini kaldır
  if (input.isPrimary) {
    await db
      .update(productImages)
      .set({ isPrimary: false })
      .where(eq(productImages.productId, productId));
  }

  const insertData: NewProductImage = {
    tenantId,
    productId,
    base64Data: input.base64Data,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    isPrimary: input.isPrimary ?? false,
    sortOrder: input.sortOrder ?? 0,
  };
  const [created] = await db.insert(productImages).values(insertData).returning();

  logger.info({ productId, imageId: created.id, fileSize: created.fileSize }, 'Image added');
  return created;
};

export const deleteProductImage = async (
  tenantId: string,
  productId: string,
  imageId: string,
): Promise<void> => {
  const result = await db
    .delete(productImages)
    .where(
      and(
        eq(productImages.id, imageId),
        eq(productImages.productId, productId),
        withTenant(productImages, tenantId),
      ),
    )
    .returning({ id: productImages.id });
  if (result.length === 0) throw new HttpError(404, 'Resim bulunamadı');
};

export const setImagePrimary = async (
  tenantId: string,
  productId: string,
  imageId: string,
): Promise<void> => {
  // Önce tüm primary'leri kaldır
  await db
    .update(productImages)
    .set({ isPrimary: false })
    .where(and(eq(productImages.productId, productId), withTenant(productImages, tenantId)));

  // Sonra bu image'ı primary yap
  const result = await db
    .update(productImages)
    .set({ isPrimary: true })
    .where(
      and(
        eq(productImages.id, imageId),
        eq(productImages.productId, productId),
        withTenant(productImages, tenantId),
      ),
    )
    .returning({ id: productImages.id });
  if (result.length === 0) throw new HttpError(404, 'Resim bulunamadı');
};
