import * as sql from 'mssql';
import { BaseErpAdapter, type ErpProduct, type ErpCustomer, type PingResult } from './BaseErpAdapter';
import { logger } from '../../utils/logger';

/**
 * Korgün ERP MSSQL adapter.
 *
 * Korgün ERP (kg_palaimon, kg_exe) MS SQL Server üzerinde çalışır.
 * Tipik tablolar:
 *   - StokKart: ürün kartları (StokKod, StokAdi, Barkod, SatisFiyat, vs.)
 *   - CariKart: müşteri/cari hesaplar (CariKod, CariAdi, Ilgili, vs.)
 *
 * Config:
 *   {
 *     server: 'localhost\\SQLEXPRESS',  // veya '192.168.1.100'
 *     database: 'KorgunDB',
 *     user: 'sa',
 *     password: '...',
 *     schemaName: 'dbo',                // default 'dbo'
 *     encrypt: false,                   // Railway/prod'da true
 *     trustServerCertificate: true,     // self-signed için
 *     productTable: 'StokKart',          // default Korgün tablo adı
 *     customerTable: 'CariKart',
 *     // Kolon eşleme (opsiyonel, default aşağıdaki Korgün isimleri):
 *     columns: {
 *       product: { id: 'StokKod', sku: 'StokKod', name: 'StokAdi', price: 'SatisFiyat', currency: 'DovizCinsi', category: 'GrupAdi', brand: 'Marka', unit: 'Birim', description: 'Aciklama' },
 *       customer: { id: 'CariKod', name: 'CariAdi', contact: 'Ilgili', email: 'Email', phone: 'Telefon', address: 'Adres', taxNumber: 'VergiNo', taxOffice: 'VergiDairesi' },
 *     }
 *   }
 *
 * NOT: mssql paketi (tedious altında) Windows Authentication'ı
 * destekler ama varsayılan olarak SQL Auth kullanır. Windows Auth
 * için: authentication.type = 'ntlm'.
 */

const DEFAULT_PRODUCT_COLUMNS = {
  id: 'StokKod',
  sku: 'StokKod',
  name: 'StokAdi',
  price: 'SatisFiyat',
  currency: 'DovizCinsi',
  category: 'GrupAdi',
  brand: 'Marka',
  unit: 'Birim',
  description: 'Aciklama',
} as const;

const DEFAULT_CUSTOMER_COLUMNS = {
  id: 'CariKod',
  name: 'CariAdi',
  contact: 'Ilgili',
  email: 'Email',
  phone: 'Telefon',
  address: 'Adres',
  taxNumber: 'VergiNo',
  taxOffice: 'VergiDairesi',
} as const;

export interface KorgunConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  schemaName?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  productTable?: string;
  customerTable?: string;
  columns?: {
    product?: Partial<typeof DEFAULT_PRODUCT_COLUMNS>;
    customer?: Partial<typeof DEFAULT_CUSTOMER_COLUMNS>;
  };
  /** Connection timeout ms */
  connectionTimeout?: number;
  /** Request timeout ms */
  requestTimeout?: number;
}

export class KorgunMssqlAdapter extends BaseErpAdapter {
  private pool: sql.ConnectionPool | null = null;
  private cfg: KorgunConfig;

  constructor(config: Record<string, unknown>) {
    super(config);
    // Validation
    this.cfg = config as unknown as KorgunConfig;
    if (!this.cfg.server || !this.cfg.database || !this.cfg.user) {
      throw new Error('KorgunMssqlAdapter: server, database, user zorunludur');
    }
  }

  get name(): string {
    return 'korgun-mssql';
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool?.connected) return this.pool;
    if (this.pool) {
      // Once bağlanmaya çalışmış ama kopmuş, temizle
      await this.pool.close().catch(() => undefined);
      this.pool = null;
    }
    const pool = new sql.ConnectionPool({
      server: this.cfg.server,
      database: this.cfg.database,
      user: this.cfg.user,
      password: this.cfg.password,
      options: {
        encrypt: this.cfg.encrypt ?? false,
        trustServerCertificate: this.cfg.trustServerCertificate ?? true,
        enableArithAbort: true,
      },
      connectionTimeout: this.cfg.connectionTimeout ?? 15_000,
      requestTimeout: this.cfg.requestTimeout ?? 60_000,
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30_000,
      },
    });
    this.pool = await pool.connect();
    logger.info({ server: this.cfg.server, database: this.cfg.database }, 'Korgün MSSQL bağlantısı kuruldu');
    return this.pool;
  }

  async ping(): Promise<PingResult> {
    const start = Date.now();
    try {
      const pool = await this.getPool();
      const result = await pool.request().query('SELECT 1 AS ok');
      const latency = Date.now() - start;
      const recordset = result.recordset as Array<{ ok: number }>;
      return {
        ok: recordset[0]?.ok === 1,
        latencyMs: latency,
        message: 'Korgün ERP erişilebilir',
        details: {
          server: this.cfg.server,
          database: this.cfg.database,
          schema: this.cfg.schemaName ?? 'dbo',
        },
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: `Korgün ERP bağlantı hatası: ${(err as Error).message}`,
      };
    }
  }

  async fetchProducts(): Promise<ErpProduct[]> {
    const pool = await this.getPool();
    const schema = this.cfg.schemaName ?? 'dbo';
    const table = this.cfg.productTable ?? 'StokKart';
    const col = { ...DEFAULT_PRODUCT_COLUMNS, ...(this.cfg.columns?.product ?? {}) };
    const quotedTable = `[${schema}].[${table}]`;

    // SQL Injection koruması: kolon adlarını whitelist'ten alıyoruz.
    // Asla kullanıcı girdisiyle dinamik SQL oluşturmuyoruz.
    const query = `
      SELECT
        [${col.id}] AS erp_id,
        [${col.sku}] AS sku,
        [${col.name}] AS name,
        [${col.description}] AS description,
        [${col.price}] AS price,
        [${col.currency}] AS currency,
        [${col.category}] AS category_name,
        [${col.brand}] AS brand,
        [${col.unit}] AS unit
      FROM ${quotedTable}
      WHERE [${col.id}] IS NOT NULL
      ORDER BY [${col.id}]
    `;

    const result = await pool.request().query(query);
    const rows = result.recordset as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const price = parseFloat(String(r.price ?? '0').replace(',', '.'));
      return {
        erpId: String(r.erp_id ?? '').trim(),
        sku: String(r.sku ?? r.erp_id ?? '').trim(),
        name: String(r.name ?? '').trim(),
        description: r.description ? String(r.description).trim() : undefined,
        price: isNaN(price) ? 0 : price,
        currency: r.currency ? normalizeCurrency(String(r.currency)) : undefined,
        categoryName: r.category_name ? String(r.category_name).trim() : undefined,
        brand: r.brand ? String(r.brand).trim() : undefined,
        unit: r.unit ? String(r.unit).trim() : undefined,
      };
    });
  }

  async fetchCustomers(): Promise<ErpCustomer[]> {
    const pool = await this.getPool();
    const schema = this.cfg.schemaName ?? 'dbo';
    const table = this.cfg.customerTable ?? 'CariKart';
    const col = { ...DEFAULT_CUSTOMER_COLUMNS, ...(this.cfg.columns?.customer ?? {}) };
    const quotedTable = `[${schema}].[${table}]`;

    const query = `
      SELECT
        [${col.id}] AS erp_id,
        [${col.name}] AS name,
        [${col.contact}] AS contact_name,
        [${col.email}] AS email,
        [${col.phone}] AS phone,
        [${col.address}] AS address,
        [${col.taxNumber}] AS tax_number,
        [${col.taxOffice}] AS tax_office
      FROM ${quotedTable}
      WHERE [${col.id}] IS NOT NULL
      ORDER BY [${col.id}]
    `;

    const result = await pool.request().query(query);
    const rows = result.recordset as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      erpId: String(r.erp_id ?? '').trim(),
      name: String(r.name ?? '').trim(),
      contactName: r.contact_name ? String(r.contact_name).trim() : undefined,
      email: r.email ? String(r.email).trim() : undefined,
      phone: r.phone ? String(r.phone).trim() : undefined,
      address: r.address ? String(r.address).trim() : undefined,
      taxNumber: r.tax_number ? String(r.tax_number).trim() : undefined,
      taxOffice: r.tax_office ? String(r.tax_office).trim() : undefined,
    }));
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close().catch(() => undefined);
      this.pool = null;
      logger.info('Korgün MSSQL bağlantısı kapatıldı');
    }
  }
}

/**
 * Korgün'den gelen para birimi string'ini normalize et.
 * TRY, TL, ₺, '' hepsi TRY; $, USD; €, EUR; £, GBP.
 */
const normalizeCurrency = (raw: string): string | undefined => {
  const s = raw.trim().toUpperCase();
  if (!s) return undefined;
  if (['TRY', 'TL', '₺', 'YTL'].includes(s)) return 'TRY';
  if (['USD', '$', 'US$'].includes(s)) return 'USD';
  if (['EUR', '€'].includes(s)) return 'EUR';
  if (['GBP', '£'].includes(s)) return 'GBP';
  // Tanınmadı, default TRY (Türkiye pazarı)
  return 'TRY';
};
