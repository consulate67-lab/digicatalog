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
  id: 'skod',                    // stokkart.skod (lowercase!)
  sku: 'skod',
  name: 'tanim',                  // stokkart.tanim
  price: 'Fiyat',                 // S_SatFiy.Fiyat (from join)
  currency: 'paracinsi',          // stokkart.paracinsi
  category: 'Tanim',              // P_STK_GRP.Tanim (from cross-db join)
  brand: 'marka',                 // stokkart.marka (infer)
  unit: 'birim',                  // stokkart.birim (infer)
  description: '',                // stokkart'ta description yok, skip
  picture: 'Picture',             // S_DetPicture.Picture
} as const;

const DEFAULT_CUSTOMER_COLUMNS = {
  id: 'ckod',                     // Cari_Kart.ckod
  name: 'cname',                  // Cari_Kart.cname
  contact: 'Yetkili',             // Cari_Kart.Yetkili (infer)
  email: 'Email',                 // (infer)
  phone: 'Telefon',               // (infer)
  address: 'Adres',               // (infer)
  taxNumber: 'VergiNo',          // (infer)
  taxOffice: 'VergiDairesi',      // (infer)
} as const;

export interface KorgunConfig {
  server: string;
  /** Ayrı port field (önerilen). Server field içinde port yoksa boş bırakılabilir. */
  port?: number;
  database: string;
  user?: string;
  password?: string;
  /**
   * Windows Authentication (NTLM/Kerberos) kullan.
   * true ise user/password gerekmez; mevcut Windows kullanici bilgileri
   * kullanilir. On-premise MSSQL icin "trustedConnection".
   * SQL auth icin false (default) ve user/password zorunlu.
   */
  integratedSecurity?: boolean;
  schemaName?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  productTable?: string;
  customerTable?: string;
  /**
   * Kategori tablosu (cross-database olabilir, orn:
   * "korgun_parameter.dbo.P_STK_GRP"). Default Korgun ERP icin.
   */
  categoryTable?: string;
  /** Kategori tablosunda ID kolonu (stokkart.grupkod ile eslesir) */
  categoryIdColumn?: string;
  /** Kategori tablosunda isim kolonu (DijiCatalog categories.name'e yazilir) */
  categoryNameColumn?: string;
  /** stokkart uzerinde grup kodu kolonu (default 'GRUPKOD') */
  stockGroupCodeColumn?: string;
  /**
   * S_SatFiy.Tip filtresi (satis fiyat tipi). Farkli ERP kurulumlarinda farkli
   * olabilir (ornek: '361' = ana satis, '362' = bayii, vs.). Default '361'.
   */
  priceTipCode?: string;
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
    if (!this.cfg.server || !this.cfg.database) {
      throw new Error('KorgunMssqlAdapter: server, database zorunludur');
    }
    // SQL auth icin user zorunlu; Windows auth (integratedSecurity) icin degil
    if (!this.cfg.integratedSecurity && !this.cfg.user) {
      throw new Error('KorgunMssqlAdapter: SQL auth icin user zorunludur (Windows auth icin integratedSecurity=true kullanin)');
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
    // Server field'ı normalize et: kullanıcı "host,port" veya "host:port" gibi
    // formatları yanlışlıkla girebiliyor. Ayrıca config.port (önerilen) öncelikli.
    const { server: parsedServer, port: parsedPort } = parseServerField(this.cfg.server);
    const port = this.cfg.port ?? parsedPort;
    const useIntegrated = this.cfg.integratedSecurity === true;
    const pool = new sql.ConnectionPool({
      server: parsedServer,
      ...(port !== undefined ? { port } : {}),
      database: this.cfg.database,
      ...(useIntegrated
        ? {}
        : { user: this.cfg.user!, password: this.cfg.password! }),
      options: {
        encrypt: this.cfg.encrypt ?? false,
        trustServerCertificate: this.cfg.trustServerCertificate ?? true,
        enableArithAbort: true,
        // Windows auth icin NTLM kullan, mevcut process'in user credential'i ile
        ...(useIntegrated
          ? { trustedConnection: true }
          : {}),
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
    logger.info(
      { server: parsedServer, port: port ?? 'default', database: this.cfg.database },
      'Korgün MSSQL bağlantısı kuruldu',
    );
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
    const table = this.cfg.productTable ?? 'stokkart';
    const col = { ...DEFAULT_PRODUCT_COLUMNS, ...(this.cfg.columns?.product ?? {}) };
    const quotedTable = `[${schema}].[${table}]`;
    const priceTip = this.cfg.priceTipCode ?? '361';

    // Kategori tablosu (cross-DB olabilir, schema-qualified verilmeli)
    const catTable = this.cfg.categoryTable ?? 'korgun_parameter.dbo.P_STK_GRP';
    const catIdCol = this.cfg.categoryIdColumn ?? 'S_GRP_KOD';
    const catNameCol = this.cfg.categoryNameColumn ?? 'Tanim';
    const stockGroupCol = this.cfg.stockGroupCodeColumn ?? 'GRUPKOD';

    // SQL Injection koruması: kolon adlarını whitelist'ten alıyoruz.
    // Bos/empty kolonlar SELECT'ten cikarilir (stokkart'ta description yok gibi).
    const selectCols: string[] = [
      `sk.[${col.id}] AS erp_id`,
      `sk.[${col.sku}] AS sku`,
      `sk.[${col.name}] AS name`,
    ];
    if (col.description) selectCols.push(`sk.[${col.description}] AS description`);
    selectCols.push(
      `ss.[${col.price}] AS price`,
      `sk.[${col.currency}] AS currency`,
    );
    if (col.brand) selectCols.push(`sk.[${col.brand}] AS brand`);
    if (col.unit) selectCols.push(`sk.[${col.unit}] AS unit`);
    selectCols.push(
      `sd.[${col.picture}] AS picture`,
      `sk.[${stockGroupCol}] AS group_code`,
      `p.[${catNameCol}] AS category_name`,
    );

    const query = `
      SELECT
        ${selectCols.join(', ')}
      FROM ${quotedTable} sk
      LEFT JOIN [${schema}].[S_SatFiy] ss
        ON ss.[SKOD] = sk.[${col.id}] AND ss.[RKOD] = 0 AND ss.[BedKod] = 0 AND ss.[Tip] = @priceTip
      LEFT JOIN [${schema}].[S_DetPicture] sd
        ON sd.[SKOD] = sk.[${col.id}] AND sd.[RKOD] = 0 AND sd.[BedKod] = 0
      LEFT JOIN ${catTable} p
        ON p.[${catIdCol}] = sk.[${stockGroupCol}]
      WHERE sk.[${col.id}] IS NOT NULL
      ORDER BY sk.[${col.id}]
    `;

    const result = await pool.request()
      .input('priceTip', sql.NVarChar, priceTip)
      .query(query);
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
        brand: r.brand ? String(r.brand).trim() : undefined,
        unit: r.unit ? String(r.unit).trim() : undefined,
        picture: r.picture ? String(r.picture).trim() : undefined,
        categoryName: r.category_name ? String(r.category_name).trim() : undefined,
      };
    });
  }

  async fetchCustomers(): Promise<ErpCustomer[]> {
    const pool = await this.getPool();
    const schema = this.cfg.schemaName ?? 'dbo';
    const table = this.cfg.customerTable ?? 'Cari_Kart';
    const col = { ...DEFAULT_CUSTOMER_COLUMNS, ...(this.cfg.columns?.customer ?? {}) };
    const quotedTable = `[${schema}].[${table}]`;

    // Opsiyonel kolonlar: bos olanlari SELECT'ten cikar
    const selectCols: string[] = [
      `[${col.id}] AS erp_id`,
      `[${col.name}] AS name`,
    ];
    if (col.contact) selectCols.push(`[${col.contact}] AS contact_name`);
    if (col.email) selectCols.push(`[${col.email}] AS email`);
    if (col.phone) selectCols.push(`[${col.phone}] AS phone`);
    if (col.address) selectCols.push(`[${col.address}] AS address`);
    if (col.taxNumber) selectCols.push(`[${col.taxNumber}] AS tax_number`);
    if (col.taxOffice) selectCols.push(`[${col.taxOffice}] AS tax_office`);

    const query = `
      SELECT
        ${selectCols.join(', ')}
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

/**
 * Server field'ı normalize et. Kullanıcı bazen virgülle/colon ile port
 * yazabiliyor ("192.168.1.197,49746", "192.168.1.197:49746", "host\instance,1433").
 * mssql kütüphanesi bu formatların hepsini kabul etmiyor; bu yüzden host/port'u
 * ayırıp temiz server değeri + ayrı port dönüyoruz.
 *
 * Kabul edilen formatlar:
 *   "host"                       → { server: "host" }
 *   "host,1433"                      → { server: "host", port: 1433 }
 *   "host:1433"                      → { server: "host", port: 1433 }
 *   "host\INSTANCE"                  → { server: "host\INSTANCE" }   (port ignored)
 *   "host\INSTANCE,1433"             → { server: "host\INSTANCE", port: 1433 }
 *
 * IPv6 için köşeli parantez kullanılırsa colon'a dokunulmaz.
 */
const parseServerField = (input: string): { server: string; port?: number } => {
  const raw = (input ?? '').trim();
  if (!raw) return { server: '' };
  // Named instance varsa ("host\INSTANCE"), virgül/colon split'i sadece
  // instance'dan sonrasına bakacak şekilde ayarla.
  const backslashIdx = raw.indexOf('\\');
  const head = backslashIdx >= 0 ? raw.slice(0, backslashIdx) : raw;
  const tail = backslashIdx >= 0 ? raw.slice(backslashIdx) : '';
  // IPv6 literal: [::1] veya [::1]:1433 — köşeli parantez varsa colon'u koru
  const isIpv6 = head.startsWith('[');
  let serverPart = head;
  let port: number | undefined;
  if (!isIpv6) {
    // Önce virgül dene (en güvenli, hemen hemen her zaman "host,port" demek)
    const commaIdx = head.lastIndexOf(',');
    if (commaIdx > 0) {
      const left = head.slice(0, commaIdx).trim();
      const right = head.slice(commaIdx + 1).trim();
      if (/^\d+$/.test(right)) {
        serverPart = left;
        port = parseInt(right, 10);
      }
    }
    if (port === undefined) {
      // Sonra colon (ama "host:port" veya IPv4:port; instance'larda instance sonrası : olabilir)
      const colonIdx = head.lastIndexOf(':');
      if (colonIdx > 0) {
        const left = head.slice(0, colonIdx).trim();
        const right = head.slice(colonIdx + 1).trim();
        if (/^\d+$/.test(right) && !left.includes('\\')) {
          serverPart = left;
          port = parseInt(right, 10);
        }
      }
    }
  }
  const server = serverPart + tail;
  return port !== undefined ? { server, port } : { server };
};
