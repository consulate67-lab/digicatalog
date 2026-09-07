/**
 * Base ERP Adapter — tüm ERP provider'ları için ortak interface.
 *
 * Yeni ERP eklemek için (örn. Mikro, Logo, Paraşüt):
 * 1) Bu interface'i implement et
 * 2) registry.ts'e ekle
 * 3) Tenant config UI'ında listele
 *
 * Her adapter:
 *   - Tenant-scoped config alır (constructor'da)
 *   - connect() ile bağlantı kurar
 *   - fetchProducts/fetchCustomers: ERP'den ürün/müşteri listesi
 *   - ping: bağlantı sağlık kontrolü
 *   - close: kaynakları temizle (connection pool, file handle, vs.)
 *
 * ErpProduct/ErpCustomer normalize edilmiş DTO'lar — DijiCatalog
 * DB şemasıyla birebir eşleşmez, mapping service katmanında yapılır.
 */

export interface ErpProduct {
  erpId: string; // ERP'deki primary key (SKU veya ID)
  sku: string;
  name: string;
  description?: string;
  price: number;
  currency?: string; // 'TRY' | 'USD' | 'EUR' | 'GBP' (default 'TRY')
  categoryName?: string;
  brand?: string;
  unit?: string;
}

export interface ErpCustomer {
  erpId: string; // ERP'deki primary key (CariKod, vs.)
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  taxOffice?: string;
}

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Abstract base class. Concrete adapter'lar extend eder.
 */
export abstract class BaseErpAdapter {
  protected config: Record<string, unknown>;

  constructor(config: Record<string, unknown>) {
    this.config = config;
  }

  /** Sağlık kontrolü — bağlantı kurulabiliyor mu? */
  abstract ping(): Promise<PingResult>;

  /** Tüm ürünleri çek. Sayfalama adapter'a bırakılmış. */
  abstract fetchProducts(): Promise<ErpProduct[]>;

  /** Tüm müşterileri çek. */
  abstract fetchCustomers(): Promise<ErpCustomer[]>;

  /** Kaynakları temizle. Override eden adapter connection pool/file kapatır. */
  abstract close(): Promise<void>;

  /** Provider adı (registry için) */
  abstract get name(): string;
}
