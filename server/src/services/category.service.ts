import sql from 'mssql';
import { getPool } from '../config/database';
import { tenantFilter, tenantWhere } from '../db/helpers';
import { HttpError } from '../middleware/errorHandler';

/**
 * Category service. Multi-tenant row-level isolation her query'de
 * tenantFilter helper'i ile uygulanir.
 *
 * NOT: Drizzle ORM'den raw mssql'e gecildi. Type-safety Zod validation
 * ile telafi edilir.
 */

const SLUG_REGEX = /^[a-z0-9-]+$/;

export interface CategoryInput {
  name: string;
  slug: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface Category {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const validateSlug = (slug: string): void => {
  if (!SLUG_REGEX.test(slug)) {
    throw new HttpError(400, 'Slug sadece kucuk harf, rakam ve tire icerebilir');
  }
};

const ensureUniqueSlug = async (
  tenantId: string,
  slug: string,
  excludeId?: string,
): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('slug', sql.NVarChar, slug)
    .query(`SELECT id FROM categories WHERE tenant_id = @tenantId AND slug = @slug`);
  const found = r.recordset[0];
  if (found && found.id !== excludeId) {
    throw new HttpError(409, 'Bu slug zaten kullaniliyor');
  }
};

const ensureParentExists = async (
  tenantId: string,
  parentId: string,
): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, parentId)
    .query(`SELECT id FROM categories WHERE id = @id AND tenant_id = @tenantId`);
  if (!r.recordset[0]) {
    throw new HttpError(404, 'Ust kategori bulunamadi');
  }
};

export const listCategories = async (
  tenantId: string,
  options: { tree?: boolean; parentId?: string | null; includeInactive?: boolean } = {},
): Promise<Category[]> => {
  const pool = await getPool();
  const req = tenantFilter(pool.request(), tenantId);
  let where = 'tenant_id = @tenantId';
  if (!options.includeInactive) where += ' AND is_active = 1';
  if (options.parentId === null) {
    where += ' AND parent_id IS NULL';
  } else if (options.parentId) {
    req.input('parentId', sql.UniqueIdentifier, options.parentId);
    where += ' AND parent_id = @parentId';
  }
  const r = await req.query(
    `SELECT id, tenant_id AS tenantId, parent_id AS parentId, name, slug, sort_order AS sortOrder,
            is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
     FROM categories WHERE ${where}
     ORDER BY sort_order ASC, name ASC`,
  );
  return r.recordset as Category[];
};

export const getCategory = async (tenantId: string, id: string): Promise<Category> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT id, tenant_id AS tenantId, parent_id AS parentId, name, slug,
            sort_order AS sortOrder, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM categories WHERE id = @id AND tenant_id = @tenantId`);
  const category = r.recordset[0];
  if (!category) throw new HttpError(404, 'Kategori bulunamadi');
  return category as Category;
};

export const createCategory = async (tenantId: string, input: CategoryInput): Promise<Category> => {
  validateSlug(input.slug);
  await ensureUniqueSlug(tenantId, input.slug);
  if (input.parentId) await ensureParentExists(tenantId, input.parentId);

  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('name', sql.NVarChar, input.name)
    .input('slug', sql.NVarChar, input.slug)
    .input('parentId', sql.UniqueIdentifier, input.parentId ?? null)
    .input('sortOrder', sql.Int, input.sortOrder ?? 0)
    .input('isActive', sql.Bit, input.isActive ?? true)
    .query(`INSERT INTO categories (tenant_id, name, slug, parent_id, sort_order, is_active)
            OUTPUT INSERTED.id, INSERTED.tenant_id AS tenantId, INSERTED.parent_id AS parentId,
                   INSERTED.name, INSERTED.slug, INSERTED.sort_order AS sortOrder,
                   INSERTED.is_active AS isActive, INSERTED.created_at AS createdAt,
                   INSERTED.updated_at AS updatedAt
            VALUES (@tenantId, @name, @slug, @parentId, @sortOrder, @isActive)`);
  return r.recordset[0] as Category;
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
    if (input.parentId === id) throw new HttpError(400, 'Kategori kendi altina eklenemez');
    await ensureParentExists(tenantId, input.parentId);
  }

  const pool = await getPool();
  await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, input.name ?? existing.name)
    .input('slug', sql.NVarChar, input.slug ?? existing.slug)
    .input('parentId', sql.UniqueIdentifier, input.parentId !== undefined ? input.parentId : existing.parentId)
    .input('sortOrder', sql.Int, input.sortOrder ?? existing.sortOrder)
    .input('isActive', sql.Bit, input.isActive ?? existing.isActive)
    .query(`UPDATE categories
            SET name = @name, slug = @slug, parent_id = @parentId,
                sort_order = @sortOrder, is_active = @isActive, updated_at = getdate()
            WHERE id = @id AND tenant_id = @tenantId`);
  return getCategory(tenantId, id);
};

export const deleteCategory = async (tenantId: string, id: string): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`DELETE FROM categories WHERE id = @id AND tenant_id = @tenantId`);
  if (r.rowsAffected[0] === 0) throw new HttpError(404, 'Kategori bulunamadi');
};