import { useState, useEffect, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plug,
  Save,
  Wifi,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import api from '../../lib/api';

interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'boolean';
  required: boolean;
  placeholder?: string;
  default?: unknown;
}

interface ProviderInfo {
  name: string;
  label: string;
  description: string;
  configSchema: ConfigField[];
}

interface TenantErpConfig {
  provider: string | null;
  config: Record<string, unknown> | null;
  providerMeta: { label: string; description: string } | null;
}

interface PingResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

interface SyncResult {
  fetched: number;
  added: number;
  updated: number;
  errors: Array<{ erpId: string; message: string }>;
}

/**
 * ERP entegrasyon ayarları sayfası (admin only).
 *
 * - Provider seçimi (dropdown)
 * - Provider'a göre dinamik config form
 * - Test connection butonu
 * - Sync products / customers butonları + sonuç kartları
 */
const Integrations = () => {
  const queryClient = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Desteklenen provider listesi
  const providersQuery = useQuery({
    queryKey: ['erp-providers'],
    queryFn: async () => {
      const res = await api.get<{ data: ProviderInfo[] }>('/integrations/erp/providers');
      return res.data.data;
    },
  });

  // Mevcut config
  const configQuery = useQuery({
    queryKey: ['erp-config'],
    queryFn: async () => {
      const res = await api.get<{ data: TenantErpConfig }>('/integrations/erp');
      return res.data.data;
    },
  });

  // İlk yüklendiğinde provider'ı set et
  useEffect(() => {
    if (configQuery.data?.provider) {
      setSelectedProvider(configQuery.data.provider);
    } else if (providersQuery.data && providersQuery.data.length > 0 && !selectedProvider) {
      setSelectedProvider(providersQuery.data[0].name);
    }
  }, [configQuery.data, providersQuery.data, selectedProvider]);

  // Provider değişince form alanlarını sıfırla (yoksa yeni default'larla başla)
  useEffect(() => {
    if (selectedProvider && providersQuery.data) {
      const provider = providersQuery.data.find((p) => p.name === selectedProvider);
      if (provider) {
        const newForm: Record<string, string> = {};
        for (const field of provider.configSchema) {
          // Önce mevcut config'den al, yoksa default
          const existing = configQuery.data?.config?.[field.key];
          if (existing !== undefined && existing !== null) {
            newForm[field.key] = String(existing);
          } else if (field.default !== undefined) {
            newForm[field.key] = String(field.default);
          } else {
            newForm[field.key] = '';
          }
        }
        setFormValues(newForm);
      }
    }
  }, [selectedProvider, providersQuery.data, configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const config: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(formValues)) {
        if (v === 'true') config[k] = true;
        else if (v === 'false') config[k] = false;
        else if (v !== '' && !isNaN(Number(v)) && /^\d+$/.test(v)) config[k] = Number(v);
        else config[k] = v;
      }
      const res = await api.put<{ data: TenantErpConfig }>('/integrations/erp', {
        provider: selectedProvider,
        config,
      });
      return res.data.data;
    },
    onSuccess: () => {
      setError(null);
      setInfo('Ayarlar kaydedildi');
      queryClient.invalidateQueries({ queryKey: ['erp-config'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Kayıt başarısız');
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: PingResult }>('/integrations/erp/test');
      return res.data.data;
    },
  });

  const syncProductsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: SyncResult }>('/integrations/erp/sync/products');
      return res.data.data;
    },
  });

  const syncCustomersMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: SyncResult }>('/integrations/erp/sync/customers');
      return res.data.data;
    },
  });

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    setInfo(null);
    setError(null);

    // Zorunlu alan kontrolü
    const provider = providersQuery.data?.find((p) => p.name === selectedProvider);
    if (!provider) return;
    for (const field of provider.configSchema) {
      if (field.required && !formValues[field.key]?.trim()) {
        setError(`${field.label} zorunludur`);
        return;
      }
    }
    saveMutation.mutate();
  };

  const selectedProviderInfo = providersQuery.data?.find((p) => p.name === selectedProvider);

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Plug className="h-6 w-6 text-brand-600" />
          ERP Entegrasyonu
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Ürün ve müşteri verilerinizi ERP sisteminizden senkronize edin.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sol: Provider + config formu */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSave} className="card space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Provider</label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {providersQuery.data?.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.label}
                  </option>
                ))}
              </select>
              {selectedProviderInfo && (
                <p className="mt-1 text-xs text-slate-500">{selectedProviderInfo.description}</p>
              )}
            </div>

            {selectedProviderInfo && selectedProviderInfo.configSchema.length > 0 && (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-700">Bağlantı Ayarları</h3>
                {selectedProviderInfo.configSchema.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-slate-700">
                      {field.label}
                      {field.required && <span className="ml-1 text-rose-500">*</span>}
                    </label>
                    {field.type === 'boolean' ? (
                      <select
                        value={formValues[field.key] ?? 'false'}
                        onChange={(e) => setFormValues({ ...formValues, [field.key]: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="true">Evet</option>
                        <option value="false">Hayır</option>
                      </select>
                    ) : (
                      <input
                        type={field.type === 'password' ? 'password' : 'text'}
                        value={formValues[field.key] ?? ''}
                        onChange={(e) => setFormValues({ ...formValues, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span>{info}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                className="btn-secondary"
              >
                {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                Bağlantıyı Test Et
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="btn-primary"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
              </button>
            </div>
          </form>

          {/* Test sonucu */}
          {testMutation.data && (
            <div
              className={`card mt-4 ${
                testMutation.data.ok
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-rose-200 bg-rose-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {testMutation.data.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-600" />
                )}
                <p
                  className={`font-medium ${
                    testMutation.data.ok ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  {testMutation.data.message ?? (testMutation.data.ok ? 'Bağlantı başarılı' : 'Bağlantı başarısız')}
                </p>
                <span className="ml-auto text-sm text-slate-600">{testMutation.data.latencyMs}ms</span>
              </div>
              {testMutation.data.details && (
                <pre className="mt-2 overflow-x-auto rounded bg-white/60 p-2 text-xs text-slate-700">
                  {JSON.stringify(testMutation.data.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Sağ: Senkronizasyon butonları */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Senkronizasyon</h3>
            <p className="mb-4 text-xs text-slate-500">
              ERP'den güncel ürün/müşteri listesi çekilir, mevcut olanlar güncellenir, yeniler eklenir.
            </p>

            <button
              onClick={() => syncProductsMutation.mutate()}
              disabled={syncProductsMutation.isPending}
              className="btn-primary w-full"
            >
              {syncProductsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Ürünleri Senkronize Et
            </button>

            {syncProductsMutation.data && (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{syncProductsMutation.data.fetched}</p>
                    <p className="text-slate-500">Çekildi</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{syncProductsMutation.data.added}</p>
                    <p className="text-slate-500">Eklendi</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{syncProductsMutation.data.updated}</p>
                    <p className="text-slate-500">Güncellendi</p>
                  </div>
                </div>
                {syncProductsMutation.data.errors.length > 0 && (
                  <p className="mt-2 text-rose-600">
                    {syncProductsMutation.data.errors.length} hata (detay log'da)
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => syncCustomersMutation.mutate()}
              disabled={syncCustomersMutation.isPending}
              className="btn-primary mt-3 w-full"
            >
              {syncCustomersMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Müşterileri Senkronize Et
            </button>

            {syncCustomersMutation.data && (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{syncCustomersMutation.data.fetched}</p>
                    <p className="text-slate-500">Çekildi</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{syncCustomersMutation.data.added}</p>
                    <p className="text-slate-500">Eklendi</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{syncCustomersMutation.data.updated}</p>
                    <p className="text-slate-500">Güncellendi</p>
                  </div>
                </div>
                {syncCustomersMutation.data.errors.length > 0 && (
                  <p className="mt-2 text-rose-600">
                    {syncCustomersMutation.data.errors.length} hata (detay log'da)
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="card bg-slate-50">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Mevcut Yapılandırma</h3>
            {configQuery.data?.provider ? (
              <div className="text-xs text-slate-600">
                <p>
                  <strong>Provider:</strong> {configQuery.data.providerMeta?.label}
                </p>
                <p className="mt-1 text-slate-500">{configQuery.data.providerMeta?.description}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Henüz provider seçilmemiş. Yukarıdan bir provider seçip ayarları kaydedin.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Integrations;
