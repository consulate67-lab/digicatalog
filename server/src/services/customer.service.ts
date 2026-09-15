import sql from 'mssql';
import { getPool } from '../config/database';
import { HttpError } from '../middleware/errorHandler';

/**
 * Customer service. Raw mssql ile multi-tenant row-level isolation.
 *
 * NOT: Drizzle ORM'den raw mssql'e gecildi (drizzle-orm'de MSSEL exports yok).
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface CustomerDTO {
  id: string;
  tenantId: string;
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

interface RawRow {
  id: string;
  tenantId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  erpCustomerId: string | null;
  source: string;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const toDTO = (c: RawRow): CustomerDTO => ({
  id: c.id,
  tenantId: c.tenantId,
  name: c.name,
  contactName: c.contactName,
  email: c.email,
  phone: c.phone,
  address: c.address,
  taxNumber: c.taxNumber,
  taxOffice: c.taxOffice,
  erpCustomerId: c.erpCustomerId,
  source: c.source as 'manual' | 'excel' | 'erp',
  notes: c.notes,
  isActive: c.isActive,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

const SELECT = `
  id, tenant_id AS tenantId, name, contact_name AS contactName, email, phone, address,
  tax_number AS taxNumber, tax_office AS taxOffice, erp_customer_id AS erpCustomerId,
  source, notes, is_active AS isActive,
  created_at AS createdAt, updated_at AS updatedAt
`;

export interface ListCustomersOptions {
  page?: number;
  limit?: number;
  search?: string;
  source?: 'manual' | 'excel' | 'erp';
  isActive?: boolean;
  erpCustomerId?: string;
}

export const listCustomers = async (
  tenantId: string,
  options: ListCustomersOptions = {},
): Promise<{ items: CustomerDTO[]; total: number }> => {
  const pool = await getPool();
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;

  let where = 'tenant_id = @tenantId';
  if (options.isActive !== undefined) where += ' AND is_active = @isActive';
  if (options.search) where += ' AND (LOWER(name) LIKE @search OR LOWER(email) LIKE @search)';
  if (options.source) where += ' AND source = @source';
  if (options.erpCustomerId !== undefined) where += ' AND erp_customer_id = @erpCustomerId';

  const req = pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('search', sql.NVarChar, options.search ? `%${options.search.toLowerCase()}%` : '')
    .input('isActive', sql.Bit, options.isActive ?? true)
    .input('source', sql.NVarChar, options.source ?? null)
    .input('erpCustomerId', sql.NVarChar, options.erpCustomerId ?? null)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit);

  const itemsR = await req.query(`SELECT ${SELECT} FROM customers WHERE ${where}
                                  ORDER BY name ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);

  const totalR = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT COUNT(*) AS total FROM customers WHERE ${where.replace(/@(\w+)/g, '@$1')}`);
  const total = totalR.recordset[0]?.total ?? 0;
  return { items: itemsR.recordset.map(toDTO), total };
};

export const getCustomer = async (tenantId: string, id: string): Promise<CustomerDTO> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`SELECT ${SELECT} FROM customers WHERE id = @id AND tenant_id = @tenantId`);
  const c = r.recordset[0];
  if (!c) throw new HttpError(404, 'Musteri bulunamadi');
  return toDTO(c);
};

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
}

export const createCustomer = async (tenantId: string, input: CustomerInput): Promise<CustomerDTO> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('name', sql.NVarChar, input.name)
    .input('contactName', sql.NVarChar, input.contactName ?? null)
    .input('email', sql.NVarChar, input.email ?? null)
    .input('phone', sql.NVarChar, input.phone ?? null)
    .input('address', sql.NVarChar, input.address ?? null)
    .input('taxNumber', sql.NVarChar, input.taxNumber ?? null)
    .input('taxOffice', sql.NVarChar, input.taxOffice ?? null)
    .input('notes', sql.NVarChar, input.notes ?? null)
    .input('isActive', sql.Bit, input.isActive ?? true)
    .query(`INSERT INTO customers (tenant_id, name, contact_name, email, phone, address, tax_number, tax_office, notes, is_active)
            OUTPUT INSERTED.id
            VALUES (@tenantId, @name, @contactName, @email, @phone, @address, @taxNumber, @taxOffice, @notes, @isActive)`);
  return getCustomer(tenantId, r.recordset[0].id);
};

export const updateCustomer = async (
  tenantId: string,
  id: string,
  input: Partial<CustomerInput>,
): Promise<CustomerDTO> => {
  const pool = await getPool();
  await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar, input.name ?? null)
    .input('contactName', sql.NVarChar, input.contactName ?? null)
    .input('email', sql.NVarChar, input.email ?? null)
    .input('phone', sql.NVarChar, input.phone ?? null)
    .input('address', sql.NVarChar, input.address ?? null)
    .input('taxNumber', sql.NVarChar, input.taxNumber ?? null)
    .input('taxOffice', sql.NVarChar, input.taxOffice ?? null)
    .input('notes', sql.NVarChar, input.notes ?? null)
    .input('isActive', sql.Bit, input.isActive ?? null)
    .query(`UPDATE customers
            SET name = COALESCE(@name, name),
                contact_name = COALESCE(@contactName, contact_name),
                email = COALESCE(@email, email),
                phone = COALESCE(@phone, phone),
                address = COALESCE(@address, address),
                tax_number = COALESCE(@taxNumber, tax_number),
                tax_office = COALESCE(@taxOffice, tax_office),
                notes = COALESCE(@notes, notes),
                is_active = COALESCE(@isActive, is_active),
                updated_at = getdate()
            WHERE id = @id AND tenant_id = @tenantId`);
  return getCustomer(tenantId, id);
};

export const deleteCustomer = async (tenantId: string, id: string): Promise<void> => {
  const pool = await getPool();
  const r = await pool.request()
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('id', sql.UniqueIdentifier, id)
    .query(`DELETE FROM customers WHERE id = @id AND tenant_id = @tenantId`);
  if (r.rowsAffected[0] === 0) throw new HttpError(404, 'Musteri bulunamadi');
};