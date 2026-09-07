import { BaseErpAdapter, type ErpProduct, type ErpCustomer, type PingResult } from './BaseErpAdapter';

/**
 * Mock ERP provider — gerçek ERP bağlantısı olmadan development/test.
 *
 * Statik JSON seed verisi döner. Config gerektirmez (boş {}).
 *
 * Production'da kullanılmaz; sadece:
 * - Adapter pattern'in çalıştığını doğrulamak
 * - Sync service'i test etmek
 * - UI demo (admin tenant'ın ERP'si mock olur)
 */
export class MockErpProvider extends BaseErpAdapter {
  get name(): string {
    return 'mock';
  }

  async ping(): Promise<PingResult> {
    const start = Date.now();
    // Simulated latency
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    return {
      ok: true,
      latencyMs: Date.now() - start,
      message: 'Mock ERP erişilebilir',
      details: { provider: 'mock', productCount: MOCK_PRODUCTS.length, customerCount: MOCK_CUSTOMERS.length },
    };
  }

  async fetchProducts(): Promise<ErpProduct[]> {
    // Kopyasını döner (caller mutate ederse sorun olmasın)
    return MOCK_PRODUCTS.map((p) => ({ ...p }));
  }

  async fetchCustomers(): Promise<ErpCustomer[]> {
    return MOCK_CUSTOMERS.map((c) => ({ ...c }));
  }

  async close(): Promise<void> {
    // No-op (no resources to release)
  }
}

// === Seed data ===

const MOCK_PRODUCTS: ErpProduct[] = [
  {
    erpId: 'MOCK-001',
    sku: 'LAP-MOCK-001',
    name: 'Mock Laptop 13"',
    description: 'Test ürünü — gerçek ERP bağlantısı olmadan kullanılır',
    price: 25999.0,
    currency: 'TRY',
    categoryName: 'Bilgisayar',
    brand: 'MockBrand',
    unit: 'adet',
  },
  {
    erpId: 'MOCK-002',
    sku: 'TEL-MOCK-002',
    name: 'Mock Telefon 128GB',
    description: 'Test ürünü',
    price: 18999.0,
    currency: 'TRY',
    categoryName: 'Telefon',
    brand: 'MockPhone',
    unit: 'adet',
  },
  {
    erpId: 'MOCK-003',
    sku: 'KLT-MOCK-003',
    name: 'Mock Koltuk Takımı',
    price: 45000.0,
    currency: 'TRY',
    categoryName: 'Mobilya',
    brand: 'MockHome',
    unit: 'takım',
  },
  {
    erpId: 'MOCK-004',
    sku: 'AYK-MOCK-004',
    name: 'Mock Ayakkabı',
    price: 1299.0,
    currency: 'TRY',
    categoryName: 'Ayakkabı',
    brand: 'MockShoes',
    unit: 'çift',
  },
  {
    erpId: 'MOCK-005',
    sku: 'KIT-MOCK-005',
    name: 'Mock Kitap Seti',
    price: 299.0,
    currency: 'TRY',
    categoryName: 'Kitap',
    unit: 'adet',
  },
];

const MOCK_CUSTOMERS: ErpCustomer[] = [
  {
    erpId: 'MOCK-C001',
    name: 'Mock Müşteri A.Ş.',
    contactName: 'Ahmet Yılmaz',
    email: 'ahmet@mocka.com',
    phone: '+90 212 555 0001',
    address: 'Mock Adres 1, İstanbul',
    taxNumber: '1111111111',
    taxOffice: 'Beşiktaş',
  },
  {
    erpId: 'MOCK-C002',
    name: 'Mock Ltd. Şti.',
    contactName: 'Ayşe Kaya',
    email: 'ayse@mockb.com',
    phone: '+90 532 111 0002',
    address: 'Mock Adres 2, Ankara',
    taxNumber: '2222222222',
    taxOffice: 'Çankaya',
  },
  {
    erpId: 'MOCK-C003',
    name: 'Mock Ticaret',
    contactName: 'Mehmet Demir',
    phone: '+90 555 999 0003',
    address: 'Mock Adres 3, İzmir',
  },
];
