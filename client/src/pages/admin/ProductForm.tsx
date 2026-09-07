import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, ArrowLeft } from 'lucide-react';
import api from '../../lib/api';
import ImageUploader, { type ManagedImage } from '../../components/ImageUploader';

interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  currency: 'TRY' | 'USD' | 'EUR' | 'GBP';
  categoryId: string | null;
  brand: string | null;
  unit: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  images: Array<{
    id: string;
    base64Data: string;
    mimeType: string;
    sortOrder: number;
    isPrimary: boolean;
    fileSize: number;
  }>;
}

/**
 * Ürün oluşturma + düzenleme (tek form, mode prop'u ile).
 *
 * Mod create:
 *   - SKU, name zorunlu
 *   - Images: local upload (server'a create sonrası sırayla POST)
 *
 * Mod edit:
 *   - Mevcut ürün yüklenir
 *   - Images: server-side yönetim (delete + setPrimary + add)
 */
const ProductForm = ({ mode }: { mode: 'create' | 'edit' }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();

  const [form, setForm] = useState({
    sku: '',
    name: '',
    description: '',
    price: 0,
    currency: 'TRY' as 'TRY' | 'USD' | 'EUR' | 'GBP',
    categoryId: '',
    brand: '',
    unit: '',
    notes: '',
    isActive: true,
  });
  const [images, setImages] = useState<ManagedImage[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Kategoriler
  const categoriesQuery = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryRef[] }>('/categories?includeInactive=true');
      return res.data.data;
    },
  });

  // Edit mode: ürünü yükle
  const productQuery = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await api.get<{ data: ProductDetail }>(`/products/${id}`);
      return res.data.data;
    },
    enabled: mode === 'edit' && !!id,
  });

  useEffect(() => {
    if (productQuery.data) {
      const p = productQuery.data;
      setForm({
        sku: p.sku,
        name: p.name,
        description: p.description ?? '',
        price: p.price,
        currency: p.currency,
        categoryId: p.categoryId ?? '',
        brand: p.brand ?? '',
        unit: p.unit ?? '',
        notes: p.notes ?? '',
        isActive: p.isActive,
      });
      setImages(
        p.images.map((img) => ({
          id: img.id,
          base64Data: img.base64Data,
          mimeType: img.mimeType,
          fileSize: img.fileSize,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder,
          local: false,
        })),
      );
    }
  }, [productQuery.data]);

  // Images değişince: silinen image'ları takip et (edit mode)
  const handleImagesChange = (next: ManagedImage[]) => {
    const prevIds = new Set(images.filter((i) => i.id).map((i) => i.id!));
    const nextIds = new Set(next.filter((i) => i.id).map((i) => i.id!));
    const removed = [...prevIds].filter((id) => !nextIds.has(id));
    setDeletedImageIds((prev) => [...prev, ...removed]);
    setImages(next);
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: form.sku,
        name: form.name,
        description: form.description || null,
        price: form.price,
        currency: form.currency,
        categoryId: form.categoryId || null,
        brand: form.brand || null,
        unit: form.unit || null,
        notes: form.notes || null,
        isActive: form.isActive,
      };
      const res = await api.post<{ data: ProductDetail }>('/products', payload);
      return res.data.data;
    },
    onSuccess: async (created) => {
      // Local image'ları sırayla yükle
      const localImages = images.filter((i) => i.local);
      for (let i = 0; i < localImages.length; i++) {
        const img = localImages[i];
        await api.post(`/products/${created.id}/images`, {
          base64Data: img.base64Data,
          mimeType: img.mimeType,
          fileSize: img.fileSize,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/admin/products');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Kayıt başarısız');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: form.sku,
        name: form.name,
        description: form.description || null,
        price: form.price,
        currency: form.currency,
        categoryId: form.categoryId || null,
        brand: form.brand || null,
        unit: form.unit || null,
        notes: form.notes || null,
        isActive: form.isActive,
      };
      await api.put(`/products/${id}`, payload);
    },
    onSuccess: async () => {
      // 1) Silinen resimleri DB'den kaldır
      for (const imageId of deletedImageIds) {
        try {
          await api.delete(`/products/${id}/images/${imageId}`);
        } catch {
          // Silinemedi, devam et
        }
      }
      // 2) Yeni local image'ları yükle
      const localImages = images.filter((i) => i.local);
      for (const img of localImages) {
        await api.post(`/products/${id}/images`, {
          base64Data: img.base64Data,
          mimeType: img.mimeType,
          fileSize: img.fileSize,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder,
        });
      }
      // 3) Primary değiştiyse güncelle
      const primary = images.find((i) => i.isPrimary);
      if (primary?.id) {
        await api.patch(`/products/${id}/images/${primary.id}/primary`);
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      navigate('/admin/products');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Güncelleme başarısız');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.sku.trim() || !form.name.trim()) {
      setError('SKU ve Ad zorunludur');
      return;
    }
    if (mode === 'create') createMutation.mutate();
    else updateMutation.mutate();
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (mode === 'edit' && productQuery.isLoading) {
    return <div className="text-slate-500">Yükleniyor...</div>;
  }
  if (mode === 'edit' && productQuery.isError) {
    return (
      <div className="text-rose-600">
        Yüklenemedi: {(productQuery.error as Error).message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/products')} className="rounded p-1.5 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </button>
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === 'create' ? 'Yeni Ürün' : 'Ürünü Düzenle'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        {/* Sol kolon: ana bilgiler */}
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Temel Bilgiler</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  SKU <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  required
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="LAP001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Ad <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Dell XPS 13"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Açıklama</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Ürün açıklaması..."
                />
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Fiyat & Stok</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Fiyat</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Para Birimi</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value as 'TRY' | 'USD' | 'EUR' | 'GBP' })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Birim</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="adet, kg, metre..."
                />
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Sınıflandırma</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Kategori</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">— Kategorisiz —</option>
                  {categoriesQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Marka</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Samsung, Apple..."
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700">Notlar</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Müşteri ziyaretinde söylenecek ek bilgiler..."
              />
            </div>
          </div>
        </div>

        {/* Sağ kolon: resimler + durum */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Resimler</h2>
            <ImageUploader images={images} onChange={handleImagesChange} />
          </div>
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Durum</h2>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">Aktif (kataloglarda görünür)</span>
            </label>
          </div>
        </div>

        {/* Submit bar */}
        <div className="lg:col-span-3">
          {error && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/products')}
              className="btn-secondary"
              disabled={isSubmitting}
            >
              İptal
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Kaydediliyor...' : mode === 'create' ? 'Oluştur' : 'Güncelle'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
