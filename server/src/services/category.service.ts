import { eq, and, asc, isNull } from 'drizzle-orm';
import { db } from '../config/database';
import { categories, type Category, type NewCategory } from '../db/schema';
import { withTenant } from '../db/helpers';
import { HttpError } from '../middleware/errorHandler';

/**
 * Category service. Multi-tenant row-level isolation her query'de
 * withTenant helper'ı ile uygulanır.
 */

const SLUG_REGEX = /^[a-z0-9-]+$/;

export interface CategoryInput {
  name: string;
  slug: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

const validateSlug = (slug: string): void => {
  if (!SLUG_REGEX.test(slug)) {
    throw new HttpError(400, 'Slug sadece küçük harf, rakam ve tire içerebilir');
  }
};

const ensureUniqueSlug = async (
  tenantId: string,
  slug: string,
  excludeId?: string,
): Promise<void> => {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.tenantId, tenantId), eq(categories.slug, slug)))
    .limit(1);
  if (existing.length > 0 && existing[0].id !== excludeId) {
    throw new HttpError(409, 'Bu slug zaten kullanılıyor');
  }
};

const ensureParentExists = async (
  tenantId: string,
  parentId: string,
): Promise<void> => {
  const [parent] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, parentId), withTenant(categories, tenantId)))
    .limit(1);
  if (!parent) {
    throw new HttpError(404, 'Üst kategori bulunamadı');
  }
};

export const listCategories = async (
  tenantId: string,
  options: { tree?: boolean; parentId?: string | null; includeInactive?: boolean } = {},
): Promise<Category[]> => {
  const conditions = [withTenant(categories, tenantId)];
  if (!options.includeInactive) conditions.push(eq(categories.isActive, true));
  if (options.parentId === null) {
    conditions.push(isNull(categories.parentId));
  } else if (options.parentId) {
    conditions.push(eq(categories.parentId, options.parentId));
  }

  return db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
};

export const getCategory = async (tenantId: string, id: string): Promise<Category> => {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), withTenant(categories, tenantId)))
    .limit(1);
  if (!category) throw new HttpError(404, 'Kategori bulunamadı');
  return category;
};

export const createCategory = async (tenantId: string, input: CategoryInput): Promise<Category> => {
  validateSlug(input.slug);
  await ensureUniqueSlug(tenantId, input.slug);
  if (input.parentId) await ensureParentExists(tenantId, input.parentId);

  const insertData: NewCategory = {
    tenantId,
    name: input.name,
    slug: input.slug,
    parentId: input.parentId ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };
  const [category] = await db.insert(categories).values(insertData).returning();
  return category;
};

export const updateCategory = async (
  tenantId: string,
  id: string,
  input: Partial<CategoryInput>,
): Promise<Category> => {
  const existing = await getCategory(tenantId, id);
  if (input.slug && input.slug !== existing.slug) {
    validateSlug(input.slug);
    await ensureUniqueSlug(tenantId, input.slug, id);
  }
  if (input.parentId && input.parentId !== existing.parentId) {
    if (input.parentId === id) throw new HttpError(400, 'Kategori kendi altına eklenemez');
    await ensureParentExists(tenantId, input.parentId);
  }

  const updateData: Partial<NewCategory> = {
    name: input.name,
    slug: input.slug,
    parentId: input.parentId,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    updatedAt: new Date(),
  };
  const [updated] = await db
    .update(categories)
    .set(updateData)
    .where(and(eq(categories.id, id), withTenant(categories, tenantId)))
    .returning();
  return updated;
};

export const deleteCategory = async (tenantId: string, id: string): Promise<void> => {
  // ON DELETE CASCADE child kategorileri ve ürünlerin categoryId'sini
  // set null yapar. Ürünler silinmez, sadece kategorisiz kalır.
  const result = await db
    .delete(categories)
    .where(and(eq(categories.id, id), withTenant(categories, tenantId)))
    .returning({ id: categories.id });
  if (result.length === 0) throw new HttpError(404, 'Kategori bulunamadı');
};
