import { eq, and, or, ilike, desc, asc, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database';
import { customers, type Customer, type NewCustomer } from '../db/schema';
import { withTenant, tenantAnd } from '../db/helpers';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Customer service. Multi-tenant row-level isolation withTenant ile.
 * Ürün service'i ile benzer pattern: list + DTO + sayfalama + arama.
 *
 * erpCustomerId: Faz 4'te ERP sync için kullanılacak. Şimdilik UI'dan
 * set edilmez, otomatik atanmaz.
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// === DTO ===

export interface CustomerDTO {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  erpCustomerId: string | null;
  source: 'manual' | 'excel' | 'erp';
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const toDTO = (c: Customer): CustomerDTO => ({
  id: c.id,
  name: c.name,
  contactName: c.contactName,
  email: c.email,
  phone: c.phone,
  address: c.address,
  taxNumber: c.taxNumber,
  taxOffice: c.taxOffice,
  erpCustomerId: c.erpCustomerId,
  source: c.source,
  notes: c.notes,
  isActive: c.isActive,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

// === List ===

export interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
  source?: 'manual' | 'excel' | 'erp';
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const listCustomers = async (
  tenantId: string,
  options: ListOptions = {},
): Promise<PaginatedResponse<CustomerDTO>> => {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;

  const conditions: (SQL | undefined)[] = [withTenant(customers, tenantId)];

  if (options.search) {
    const term = `%${options.search}%`;
    conditions.push(
      or(
        ilike(customers.name, term),
        ilike(customers.contactName, term),
        ilike(customers.email, term),
        ilike(customers.phone, term),
        ilike(customers.taxNumber, term),
      ),
    );
  }
  if (options.source) conditions.push(eq(customers.source, options.source));
  if (typeof options.isActive === 'boolean') conditions.push(eq(customers.isActive, options.isActive));

  const sortBy = options.sortBy ?? 'name';
  const sortOrder = options.sortOrder ?? 'asc';
  const orderColumn = {
    name: customers.name,
    createdAt: customers.createdAt,
    updatedAt: customers.updatedAt,
  }[sortBy];
  const orderFn = sortOrder === 'asc' ? asc : desc;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(tenantAnd(customers, tenantId, ...conditions));

  const rows = await db
    .select()
    .from(customers)
    .where(tenantAnd(customers, tenantId, ...conditions))
    .orderBy(orderFn(orderColumn), asc(customers.id))
    .limit(limit)
    .offset(offset);

  return {
    data: rows.map(toDTO),
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  };
};

// === Get one ===

export const getCustomer = async (tenantId: string, id: string): Promise<CustomerDTO> => {
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), withTenant(customers, tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, 'Müşteri bulunamadı');
  return toDTO(row);
};

// === Create ===

export interface CustomerInput {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  notes?: string | null;
  isActive?: boolean;
  source?: 'manual' | 'excel' | 'erp';
  erpCustomerId?: string | null;
}

export const createCustomer = async (tenantId: string, input: CustomerInput): Promise<CustomerDTO> => {
  if (!input.name?.trim()) throw new HttpError(400, 'Firma adı zorunludur');

  const insertData: NewCustomer = {
    tenantId,
    name: input.name.trim(),
    contactName: input.contactName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    taxNumber: input.taxNumber ?? null,
    taxOffice: input.taxOffice ?? null,
    erpCustomerId: input.erpCustomerId ?? null,
    source: input.source ?? 'manual',
    notes: input.notes ?? null,
    isActive: input.isActive ?? true,
  };
  const [created] = await db.insert(customers).values(insertData).returning();
  logger.info({ customerId: created.id, tenantId, name: created.name }, 'Customer created');
  return toDTO(created);
};

// === Update ===

export const updateCustomer = async (
  tenantId: string,
  id: string,
  input: Partial<CustomerInput>,
): Promise<CustomerDTO> => {
  const existing = await getCustomer(tenantId, id);
  const updateData: Partial<NewCustomer> = {
    name: input.name?.trim(),
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    address: input.address,
    taxNumber: input.taxNumber,
    taxOffice: input.taxOffice,
    notes: input.notes,
    isActive: input.isActive,
    updatedAt: new Date(),
  };
  // undefined alanları at
  Object.keys(updateData).forEach(
    (k) => updateData[k as keyof Partial<NewCustomer>] === undefined && delete updateData[k as keyof Partial<NewCustomer>],
  );

  await db
    .update(customers)
    .set(updateData)
    .where(and(eq(customers.id, id), withTenant(customers, tenantId)));

  logger.info({ customerId: id, tenantId, prev: existing.name }, 'Customer updated');
  return getCustomer(tenantId, id);
};

// === Delete ===

export const deleteCustomer = async (tenantId: string, id: string): Promise<void> => {
  const result = await db
    .delete(customers)
    .where(and(eq(customers.id, id), withTenant(customers, tenantId)))
    .returning({ id: customers.id });
  if (result.length === 0) throw new HttpError(404, 'Müşteri bulunamadı');
  logger.info({ customerId: id, tenantId }, 'Customer deleted');
};

// === Bulk operations ===

/**
 * Birden fazla müşteriyi tek seferde ekle (Excel import veya ERP sync için).
 * Dışarıdan çağrılan internal API. Validation minimal — caller
 * sorumludur. Duplicate name+tenant kombinasyonu atlanır.
 */
export const bulkCreateCustomers = async (
  tenantId: string,
  inputs: Array<CustomerInput & { source?: 'manual' | 'excel' | 'erp' }>,
): Promise<{ added: number; skipped: number }> => {
  if (inputs.length === 0) return { added: 0, skipped: 0 };

  // Mevcut isimleri al (duplicate detection)
  const names = inputs.map((i) => i.name.trim()).filter(Boolean);
  const existingNames = new Set<string>();
  if (names.length > 0) {
    const existing = await db
      .select({ name: customers.name })
      .from(customers)
      .where(withTenant(customers, tenantId));
    for (const e of existing) existingNames.add(e.name);
  }

  const toInsert: NewCustomer[] = [];
  let skipped = 0;
  for (const input of inputs) {
    const name = input.name?.trim();
    if (!name) {
      skipped++;
      continue;
    }
    if (existingNames.has(name)) {
      skipped++;
      continue;
    }
    toInsert.push({
      tenantId,
      name,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      taxNumber: input.taxNumber ?? null,
      taxOffice: input.taxOffice ?? null,
      erpCustomerId: input.erpCustomerId ?? null,
      source: input.source ?? 'excel',
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    });
    existingNames.add(name);
  }

  if (toInsert.length === 0) return { added: 0, skipped };

  // 100'lü chunk
  const CHUNK_SIZE = 100;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    await db.insert(customers).values(chunk);
  }

  return { added: toInsert.length, skipped };
};
