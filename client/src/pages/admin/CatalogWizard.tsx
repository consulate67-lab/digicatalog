import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  Loader2,
  Search,
  Filter,
  Eye,
  EyeOff,
} from 'lucide-react';
import api from '../../lib/api';

// === Types ===

interface CatalogSummary {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  itemCount: number;
  customerCount: number;
}

interface CatalogDetail {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  items: Array<{
    id: string;
    productId: string;
    sortOrder: number;
    customPrice: number | null;
    customNotes: string | null;
    product: {
      id: string;
      sku: string;
      name: string;
      price: number;
      currency: string;
      category: { id: string; name: string } | null;
      primaryImage: { base64Data: string; mimeType: string } | null;
    };
  }>;
  customers: Array<{
    customerId: string;
    customer: { id: string; name: string; contactName: string | null; email: string | null; phone: string | null };
  }>;
  fieldConfig: Array<{
    fieldName: string;
    isVisible: boolean;
    sortOrder: number;
    label: string;
  }>;
}

interface Customer {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface FilteredProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency: string;
  category: { id: string; name: string } | null;
  brand: string | null;
  primaryImage: { base64Data: string; mimeType: string } | null;
  alreadyInCatalog: boolean;
}

const STEPS = [
  { key: 'basic', label: 'Temel Bilgiler' },
  { key: 'customers', label: 'Müşteriler' },
  { key: 'products', label: 'Ürünler' },
  { key: 'fields', label: 'Alan Görünürlüğü' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

const FIELD_DEFS = [
  { key: 'sku', label: 'SKU' },
  { key: 'name', label: 'Ürün Adı' },
  { key: 'description', label: 'Açıklama' },
  { key: 'price', label: 'Fiyat' },
  { key: 'currency', label: 'Para Birimi' },
  { key: 'category', label: 'Kategori' },
  { key: 'brand', label: 'Marka' },
  { key: 'unit', label: 'Birim' },
  { key: 'notes', label: 'Notlar' },
  { key: 'images', label: 'Görseller' },
] as const;

const CatalogWizard = ({ mode }: { mode: 'create' | 'edit' }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [step, setStep] = useState<StepKey>('basic');
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'draft' as 'draft' | 'active' | 'archived',
  });
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set());
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, boolean>>(
    Object.fromEntries(FIELD_DEFS.map((f) => [f.key, true])),
  );

  // === Load existing catalog (edit mode) ===
  const detailQuery = useQuery({
    queryKey: ['catalog-detail', id],
    queryFn: async () => {
      const res = await api.get<{ data: CatalogDetail }>(`/catalogs/${id}`);
      return res.data.data;
    },
    enabled: mode === 'edit' && !!id,
  });

  useEffect(() => {
    if (detailQuery.data) {
      const c = detailQuery.data;
      setForm({
        name: c.name,
        description: c.description ?? '',
        status: c.status,
      });
      setSelectedCustomerIds(new Set(c.customers.map((cc) => cc.customerId)));
      setAddedProductIds(new Set(c.items.map((i) => i.productId)));
      const vis: Record<string, boolean> = {};
      for (const def of FIELD_DEFS) {
        const f = c.fieldConfig.find((fc) => fc.fieldName === def.key);
        vis[def.key] = f ? f.isVisible : true;
      }
      setFieldVisibility(vis);
    }
  }, [detailQuery.data]);

  // === Step 2: customers ===
  const customersQuery = useQuery({
    queryKey: ['customers', 'all-for-catalog'],
    queryFn: async () => {
      const res = await api.get<{ data: Customer[] }>('/customers?limit=200');
      return res.data.data;
    },
    enabled: step === 'customers' || (mode === 'edit' && step !== 'basic'),
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const filteredCustomers = customersQuery.data?.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.contactName?.toLowerCase().includes(customerSearch.toLowerCase()),
  ) ?? [];

  // === Step 3: products (filter) ===
  const [productFilter, setProductFilter] = useState({
    search: '',
    categoryId: '',
    brand: '',
    priceMin: '',
    priceMax: '',
  });
  const categoriesQuery = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () => {
      const res = await api.get<{ data: Category[] }>('/categories?includeInactive=true');
      return res.data.data;
    },
    enabled: step === 'products',
  });
  const productsQuery = useQuery({
    queryKey: ['catalog-filter', id, productFilter],
    queryFn: async () => {
      if (!id) return [] as FilteredProduct[];
      const params = new URLSearchParams();
      if (productFilter.search) params.set('search', productFilter.search);
      if (productFilter.categoryId) params.set('categoryId', productFilter.categoryId);
      if (productFilter.brand) params.set('brand', productFilter.brand);
      if (productFilter.priceMin) params.set('priceMin', productFilter.priceMin);
      if (productFilter.priceMax) params.set('priceMax', productFilter.priceMax);
      params.set('excludeInCatalog', 'false');
      params.set('limit', '60');
      const res = await api.get<{ data: FilteredProduct[] }>(`/catalogs/${id}/filter?${params}`);
      return res.data.data;
    },
    enabled: step === 'products' && !!id,
  });

  // === Mutations ===

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: CatalogSummary }>('/catalogs', {
        name: form.name,
        description: form.description || null,
        status: form.status,
      });
      return res.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/catalogs/${id}`, {
        name: form.name,
        description: form.description || null,
        status: form.status,
      });
    },
  });

  const assignCustomersMutation = useMutation({
    mutationFn: async (customerIds: string[]) => {
      await api.post(`/catalogs/${id}/customers`, { customerIds });
    },
  });

  const removeCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      await api.delete(`/catalogs/${id}/customers/${customerId}`);
    },
  });

  const addItemsMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      for (const productId of productIds) {
        await api.post(`/catalogs/${id}/items`, { productId });
      }
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (productId: string) => {
      // detail'ten itemId bul
      const detail = detailQuery.data;
      if (!detail) return;
      const item = detail.items.find((i) => i.productId === productId);
      if (item) await api.delete(`/catalogs/${id}/items/${item.id}`);
    },
  });

  const updateFieldsMutation = useMutation({
    mutationFn: async () => {
      const fields = FIELD_DEFS.map((f, i) => ({
        fieldName: f.key,
        isVisible: fieldVisibility[f.key] ?? true,
        sortOrder: i,
      }));
      await api.put(`/catalogs/${id}/fields`, { fields });
    },
  });

  // === Step navigation ===

  const goNext = async () => {
    setError(null);

    if (step === 'basic') {
      if (!form.name.trim()) {
        setError('Katalog adı zorunludur');
        return;
      }
      try {
        if (mode === 'create') {
          const created = await createMutation.mutateAsync();
          // Edit mode'a geç, id'yi set et
          navigate(`/admin/catalogs/${created.id}`, { replace: true });
          return;
        } else {
          await updateMutation.mutateAsync();
        }
        setStep('customers');
      } catch (err) {
        setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Kayıt başarısız');
      }
      return;
    }

    if (step === 'customers') {
      // Mevcut atamaları çıkar, yenileri ekle
      const existingIds = new Set(detailQuery.data?.customers.map((c) => c.customerId) ?? []);
      const toAdd = [...selectedCustomerIds].filter((id) => !existingIds.has(id));
      const toRemove = [...existingIds].filter((id) => !selectedCustomerIds.has(id));
      try {
        if (toAdd.length > 0) await assignCustomersMutation.mutateAsync(toAdd);
        for (const cid of toRemove) await removeCustomerMutation.mutateAsync(cid);
        queryClient.invalidateQueries({ queryKey: ['catalog-detail', id] });
        setStep('products');
      } catch (err) {
        setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Müşteri atama başarısız');
      }
      return;
    }

    if (step === 'products') {
      const existingIds = new Set(detailQuery.data?.items.map((i) => i.productId) ?? []);
      const toAdd = [...addedProductIds].filter((id) => !existingIds.has(id));
      const toRemove = [...existingIds].filter((id) => !addedProductIds.has(id));
      try {
        if (toAdd.length > 0) await addItemsMutation.mutateAsync(toAdd);
        for (const pid of toRemove) await removeItemMutation.mutateAsync(pid);
        queryClient.invalidateQueries({ queryKey: ['catalog-detail', id] });
        queryClient.invalidateQueries({ queryKey: ['catalogs'] });
        setStep('fields');
      } catch (err) {
        setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Ürün ekleme başarısız');
      }
      return;
    }

    if (step === 'fields') {
      try {
        await updateFieldsMutation.mutateAsync();
        queryClient.invalidateQueries({ queryKey: ['catalog-detail', id] });
        queryClient.invalidateQueries({ queryKey: ['catalogs'] });
        navigate('/admin/catalogs');
      } catch (err) {
        setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Alan güncelleme başarısız');
      }
    }
  };

  const goBack = () => {
    setError(null);
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) setStep(STEPS[idx - 1].key);
  };

  if (mode === 'edit' && detailQuery.isLoading) {
    return <div className="text-slate-500">Yükleniyor...</div>;
  }
  if (mode === 'edit' && detailQuery.isError) {
    return <div className="text-rose-600">Yüklenemedi: {(detailQuery.error as Error).message}</div>;
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    assignCustomersMutation.isPending ||
    addItemsMutation.isPending ||
    removeCustomerMutation.isPending ||
    removeItemMutation.isPending ||
    updateFieldsMutation.isPending;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate('/admin/catalogs')} className="rounded p-1.5 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-500" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === 'create' ? 'Yeni Katalog' : 'Kataloğu Düzenle'}
        </h1>
      </div>

      {/* Stepper */}
      <div className="card mb-6">
        <ol className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const isActive = s.key === step;
            const isDone = i < stepIndex;
            return (
              <li key={s.key} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => i <= stepIndex && setStep(s.key)}
                  disabled={i > stepIndex}
                  className={`flex items-center gap-2 ${
                    isActive ? 'text-brand-700' : isDone ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      isActive
                        ? 'bg-brand-600 text-white'
                        : isDone
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className="text-sm font-medium">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`mx-3 h-px flex-1 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      )}

      {/* Step content */}
      {step === 'basic' && (
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Katalog Adı <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="İlkbahar 2026 Kataloğu"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Açıklama</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Müşteri ziyareti sırasında gösterilecek katalog..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Durum</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as 'draft' | 'active' | 'archived' })}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="draft">Taslak (viewer'da gözükmez)</option>
              <option value="active">Aktif (viewer linki erişilebilir)</option>
              <option value="archived">Arşivlendi</option>
            </select>
          </div>
        </div>
      )}

      {step === 'customers' && (
        <div className="card space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Müşteri Seçimi ({selectedCustomerIds.size} seçili)
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Bu kataloğu görecek müşterileri seçin. İstediğiniz kadar seçebilirsiniz.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Müşteri ara..."
              className="block w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200">
            {customersQuery.isLoading ? (
              <p className="p-4 text-center text-sm text-slate-500">Yükleniyor...</p>
            ) : filteredCustomers.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-500">Müşteri bulunamadı</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {filteredCustomers.map((c) => {
                  const selected = selectedCustomerIds.has(c.id);
                  return (
                    <li
                      key={c.id}
                      onClick={() => {
                        const next = new Set(selectedCustomerIds);
                        if (selected) next.delete(c.id);
                        else next.add(c.id);
                        setSelectedCustomerIds(next);
                      }}
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50 ${
                        selected ? 'bg-brand-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{c.name}</p>
                        {(c.contactName || c.email) && (
                          <p className="text-xs text-slate-500">
                            {c.contactName}
                            {c.email && ` · ${c.email}`}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {step === 'products' && (
        <div className="space-y-3">
          {/* Hızlı bant filtreler */}
          <div className="card">
            <div className="mb-2 flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700">Hızlı Bant Filtre</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <input
                  type="text"
                  value={productFilter.search}
                  onChange={(e) => setProductFilter({ ...productFilter, search: e.target.value })}
                  placeholder="Ürün adı veya SKU..."
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <select
                  value={productFilter.categoryId}
                  onChange={(e) => setProductFilter({ ...productFilter, categoryId: e.target.value })}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Tüm kategoriler</option>
                  {categoriesQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <input
                  type="text"
                  value={productFilter.brand}
                  onChange={(e) => setProductFilter({ ...productFilter, brand: e.target.value })}
                  placeholder="Marka..."
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={productFilter.priceMin}
                  onChange={(e) => setProductFilter({ ...productFilter, priceMin: e.target.value })}
                  placeholder="Min ₺"
                  className="block w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <input
                  type="number"
                  value={productFilter.priceMax}
                  onChange={(e) => setProductFilter({ ...productFilter, priceMax: e.target.value })}
                  placeholder="Max ₺"
                  className="block w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          {/* Ürün listesi */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-2 text-sm text-slate-600">
              {addedProductIds.size} ürün seçildi
              {productsQuery.data && ` · ${productsQuery.data.length} sonuç`}
            </div>
            {productsQuery.isLoading ? (
              <p className="p-8 text-center text-sm text-slate-500">Yükleniyor...</p>
            ) : !productsQuery.data || productsQuery.data.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">Filtreye uyan ürün yok</p>
            ) : (
              <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {productsQuery.data.map((p) => {
                  const selected = addedProductIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        const next = new Set(addedProductIds);
                        if (selected) next.delete(p.id);
                        else next.add(p.id);
                        setAddedProductIds(next);
                      }}
                      className={`group relative cursor-pointer overflow-hidden rounded-md border-2 p-3 transition-colors ${
                        selected
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {p.primaryImage ? (
                          <img
                            src={p.primaryImage.base64Data}
                            alt={p.name}
                            className="h-12 w-12 flex-shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400">
                            <span className="text-xs">📦</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                          <p className="truncate font-mono text-xs text-slate-500">{p.sku}</p>
                          <p className="mt-0.5 text-sm tabular-nums text-slate-700">
                            {p.price.toLocaleString('tr-TR')} {p.currency}
                          </p>
                          {p.alreadyInCatalog && !selected && (
                            <span className="mt-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                              Zaten eklendi
                            </span>
                          )}
                        </div>
                      </div>
                      {selected && (
                        <div className="absolute right-2 top-2 rounded-full bg-brand-600 p-0.5 text-white">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'fields' && (
        <div className="card space-y-3">
          <p className="text-sm text-slate-600">
            Viewer ekranında hangi alanların gösterileceğini seçin. Varsayılan olarak tüm alanlar görünür.
          </p>
          <div className="divide-y divide-slate-200">
            {FIELD_DEFS.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-slate-900">{f.label}</span>
                <button
                  type="button"
                  onClick={() => setFieldVisibility({ ...fieldVisibility, [f.key]: !fieldVisibility[f.key] })}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
                    fieldVisibility[f.key]
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {fieldVisibility[f.key] ? (
                    <>
                      <Eye className="h-4 w-4" /> Görünür
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-4 w-4" /> Gizli
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0 || isSubmitting}
          className="btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={isSubmitting || (mode === 'edit' && !id)}
          className="btn-primary"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {stepIndex === STEPS.length - 1 ? (
            <>
              <Save className="h-4 w-4" />
              Tamamla
            </>
          ) : (
            <>
              İleri
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CatalogWizard;
