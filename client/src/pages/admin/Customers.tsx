import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Users,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Mail,
  Phone,
} from 'lucide-react';
import api from '../../lib/api';

interface CustomerDTO {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  source: 'manual' | 'excel' | 'erp';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;

const sourceLabel = (s: CustomerDTO['source']): string => {
  const map = { manual: 'Manuel', excel: 'Excel', erp: 'ERP' } as const;
  return map[s] ?? s;
};

const sourceColor = (s: CustomerDTO['source']): string => {
  const map = {
    manual: 'bg-slate-100 text-slate-700',
    excel: 'bg-emerald-50 text-emerald-700',
    erp: 'bg-blue-50 text-blue-700',
  } as const;
  return map[s] ?? 'bg-slate-100 text-slate-700';
};

const Customers = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const customersQuery = useQuery({
    queryKey: ['customers', page, search, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (search) params.set('search', search);
      if (activeFilter !== 'all') params.set('isActive', activeFilter === 'active' ? 'true' : 'false');
      const res = await api.get<PaginatedResponse<CustomerDTO>>(`/customers?${params}`);
      return res.data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (c: CustomerDTO) => {
      await api.put(`/customers/${c.id}`, { isActive: !c.isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/customers/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  const handleDelete = (c: CustomerDTO) => {
    if (confirm(`"${c.name}" müşterisi silinecek. Devam edilsin mi?`)) {
      deleteMutation.mutate(c.id);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = customersQuery.data?.pagination.totalPages ?? 1;
  const total = customersQuery.data?.pagination.total ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Users className="h-6 w-6 text-brand-600" />
            Müşteriler
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Toplam <strong>{total}</strong> müşteri
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/customers/import" className="btn-secondary">
            <Plus className="h-4 w-4" />
            Toplu İçe Aktar
          </Link>
          <Link to="/admin/customers/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            Yeni Müşteri
          </Link>
        </div>
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
              placeholder="Ad, ilgili kişi, email, telefon, vergi no..."
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </form>
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
        {customersQuery.isLoading ? (
          <div className="p-12 text-center text-slate-500">Yükleniyor...</div>
        ) : customersQuery.isError ? (
          <div className="p-12 text-center text-rose-600">
            Yüklenemedi: {(customersQuery.error as Error).message}
          </div>
        ) : customersQuery.data && customersQuery.data.data.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2">Henüz müşteri yok</p>
            <Link to="/admin/customers/new" className="btn-primary mt-4">
              İlk müşteriyi ekle
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Firma Adı</th>
                <th className="px-4 py-3">İlgili Kişi</th>
                <th className="px-4 py-3">İletişim</th>
                <th className="px-4 py-3">Vergi</th>
                <th className="px-4 py-3">Kaynak</th>
                <th className="px-4 py-3 text-center">Durum</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {customersQuery.data?.data.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.contactName ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.email && (
                      <div className="flex items-center gap-1 text-slate-700">
                        <Mail className="h-3 w-3 text-slate-400" />
                        {c.email}
                      </div>
                    )}
                    {c.phone && (
                      <div className="mt-0.5 flex items-center gap-1 text-slate-700">
                        <Phone className="h-3 w-3 text-slate-400" />
                        {c.phone}
                      </div>
                    )}
                    {!c.email && !c.phone && <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.taxNumber ? (
                      <>
                        <div className="font-mono text-slate-700">{c.taxNumber}</div>
                        {c.taxOffice && <div className="text-slate-500">{c.taxOffice}</div>}
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceColor(c.source)}`}>
                      {sourceLabel(c.source)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive.mutate(c)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {c.isActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {c.isActive ? 'Aktif' : 'Pasif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/admin/customers/${c.id}`)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="Düzenle"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
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

export default Customers;
