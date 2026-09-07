import { BaseErpAdapter } from './BaseErpAdapter';
import { MockErpProvider } from './MockErpProvider';
import { KorgunMssqlAdapter } from './KorgunMssqlAdapter';
import { HttpError } from '../../middleware/errorHandler';

/**
 * ERP provider registry.
 *
 * Yeni provider eklemek için:
 * 1) Yeni adapter sınıfı yaz (BaseErpAdapter'ı extend et)
 * 2) Burada PROVIDERS map'ine ekle
 * 3) tenant config UI'ında otomatik listelenir
 *
 * Provider isimleri ('mock', 'korgun-mssql') veritabanında
 * tenants.erpProvider kolonunda saklanır.
 */

export const PROVIDERS = {
  mock: {
    label: 'Mock (Test/Demo)',
    description: 'Gerçek ERP bağlantısı yok. JSON seed verisi döner.',
    factory: (config: Record<string, unknown>) => new MockErpProvider(config),
    configSchema: [] as const, // mock config gerektirmez
  },
  'korgun-mssql': {
    label: 'Korgün ERP (MSSQL)',
    description: 'Korgün ERP veritabanına doğrudan MSSQL bağlantısı.',
    factory: (config: Record<string, unknown>) => new KorgunMssqlAdapter(config),
    configSchema: [
      { key: 'server', label: 'Sunucu', type: 'string', required: true, placeholder: 'localhost\\SQLEXPRESS veya 192.168.1.100' },
      { key: 'database', label: 'Veritabanı', type: 'string', required: true, placeholder: 'KorgunDB' },
      { key: 'user', label: 'Kullanıcı', type: 'string', required: true, placeholder: 'sa' },
      { key: 'password', label: 'Şifre', type: 'password', required: true, placeholder: '••••••' },
      { key: 'schemaName', label: 'Schema', type: 'string', required: false, placeholder: 'dbo' },
      { key: 'encrypt', label: 'Encrypt (SSL)', type: 'boolean', required: false, default: false },
      { key: 'trustServerCertificate', label: 'Self-signed sertifika kabul', type: 'boolean', required: false, default: true },
    ] as const,
  },
} as const;

export type ProviderName = keyof typeof PROVIDERS;

export const getAdapter = (
  providerName: string | null | undefined,
  config: Record<string, unknown>,
): BaseErpAdapter => {
  if (!providerName) {
    // Default: mock
    return PROVIDERS.mock.factory(config);
  }
  if (!(providerName in PROVIDERS)) {
    throw new HttpError(400, `Bilinmeyen ERP provider: ${providerName}. Desteklenenler: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return PROVIDERS[providerName as ProviderName].factory(config);
};

export const listProviders = (): Array<{
  name: ProviderName;
  label: string;
  description: string;
  configSchema: ReadonlyArray<{ key: string; label: string; type: string; required: boolean; placeholder?: string; default?: unknown }>;
}> => {
  return Object.entries(PROVIDERS).map(([name, p]) => ({
    name: name as ProviderName,
    label: p.label,
    description: p.description,
    configSchema: [...p.configSchema],
  }));
};
