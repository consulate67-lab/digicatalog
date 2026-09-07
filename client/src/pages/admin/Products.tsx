import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Package,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import api from '../../lib/api';

interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

interface ProductDTO {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency: string;
  category: CategoryRef | null;
  brand: string | null;
  isActive: boolean;
  imageCount: number;
  primaryImage: { id: string; base64Data: string; mimeType: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;

/**
 * Ürün listesi. Server-side pagination, search, filter, sort.
 */
const Products = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Ürün listesi
  const productsQuery = useQuery({
    queryKey: ['products', page, search, categoryFilter, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (search) params.set('search', search);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (activeFilter !== 'all') params.set('isActive', activeFilter === 'active' ? 'true' : 'false');
      const res = await api.get<PaginatedResponse<ProductDTO>>(`/products?${params}`);
      return res.data;
    },
  });

  // Kategori listesi (filter dropdown için)
  const categoriesQuery = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryRef[] }>('/categories?includeInactive=true');
      return res.data.data;
    },
  });

  // Toggle active
  const toggleActive = useMutation({
    mutationFn: async (product: ProductDTO) => {
      await api.put(`/products/${product.id}`, { isActive: !product.isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/products/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const handleDelete = (product: ProductDTO) => {
    if (confirm(`"${product.name}" ürünü silinecek. Devam edilsin mi?`)) {
      deleteMutation.mutate(product.id);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = productsQuery.data?.pagination.totalPages ?? 1;
  const total = productsQuery.data?.pagination.total ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Package className="h-6 w-6 text-brand-600" />
            Ürünler
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Toplam <strong>{total}</strong> ürün
          </p>
        </div>
        <Link to="/admin/products/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          Yeni Ürün
        </Link>
      </div>

      {/* Filtreler */}
      <div className="card mt-6 flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-600">Arama</label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="SKU, ad veya açıklama..."
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </form>

        <div className="min-w-[180px]">
          <label className="block text-xs font-medium text-slate-600">Kategori</label>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Tümü</option>
            {categoriesQuery.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-slate-600">Durum</label>
          <select
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value as 'all' | 'active' | 'inactive');
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">Tümü</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
        </div>
      </div>

      {/* Tablo */}
      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {productsQuery.isLoading ? (
          <div className="p-12 text-center text-slate-500">Yükleniyor...</div>
        ) : productsQuery.isError ? (
          <div className="p-12 text-center text-rose-600">
            Yüklenemedi: {(productsQuery.error as Error).message}
          </div>
        ) : productsQuery.data && productsQuery.data.data.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Package className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2">Henüz ürün yok</p>
            <Link to="/admin/products/new" className="btn-primary mt-4">
              İlk ürünü ekle
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Görsel</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Ad</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Fiyat</th>
                <th className="px-4 py-3 text-center">Durum</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {productsQuery.data?.data.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {p.primaryImage ? (
                      <img
                        src={p.primaryImage.base64Data}
                        alt={p.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-400">
                        <Package className="h-4 w-4" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.sku}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.name}
                    {p.brand && <span className="ml-2 text-xs text-slate-500">({p.brand})</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.category?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {p.price.toLocaleString('tr-TR')} {p.currency}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive.mutate(p)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.isActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {p.isActive ? 'Aktif' : 'Pasif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/admin/products/${p.id}`)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="Düzenle"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        title="Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Sayfa {page} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
              Önceki
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-secondary"
            >
              Sonraki
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
