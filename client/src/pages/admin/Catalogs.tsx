import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  BookOpen,
  Edit,
  Trash2,
  Eye,
  Users,
  Package,
  FileDown,
  Loader2,
} from 'lucide-react';
import api from '../../lib/api';
import { downloadCatalogPdf } from '../../lib/pdfDownload';

interface CatalogSummary {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  createdBy: string | null;
  itemCount: number;
  customerCount: number;
  createdAt: string;
  updatedAt: string;
}

const statusLabel = (s: CatalogSummary['status']): string => {
  const map = { draft: 'Taslak', active: 'Aktif', archived: 'Arşivlendi' } as const;
  return map[s] ?? s;
};

const statusColor = (s: CatalogSummary['status']): string => {
  const map = {
    draft: 'bg-amber-50 text-amber-700',
    active: 'bg-emerald-50 text-emerald-700',
    archived: 'bg-slate-100 text-slate-600',
  } as const;
  return map[s] ?? 'bg-slate-100 text-slate-600';
};

const Catalogs = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'active' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleDownloadPdf = async (catalogId: string) => {
    setPdfError(null);
    setPdfDownloadingId(catalogId);
    try {
      await downloadCatalogPdf({ catalogId, filenamePrefix: 'katalog' });
    } catch (err) {
      setPdfError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'PDF oluşturulamadı',
      );
    } finally {
      setPdfDownloadingId(null);
    }
  };

  const catalogsQuery = useQuery({
    queryKey: ['catalogs', statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await api.get<{ data: CatalogSummary[] }>(`/catalogs?${params}`);
      return res.data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/catalogs/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalogs'] }),
  });

  const handleDelete = (c: CatalogSummary) => {
    if (confirm(`"${c.name}" kataloğu silinecek. Bu işlem geri alınamaz. Devam edilsin mi?`)) {
      deleteMutation.mutate(c.id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BookOpen className="h-6 w-6 text-brand-600" />
            Kataloglar
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Müşterilerinize özel ürün katalogları oluşturun.
          </p>
        </div>
        <Link to="/admin/catalogs/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          Yeni Katalog
        </Link>
      </div>

      {/* Filtreler */}
      {pdfError && (
        <div className="card mt-6 border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {pdfError}
        </div>
      )}
      <div className="card mt-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-600">Arama</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Katalog adı veya açıklama..."
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-slate-600">Durum</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">Tümü</option>
            <option value="draft">Taslak</option>
            <option value="active">Aktif</option>
            <option value="archived">Arşivlendi</option>
          </select>
        </div>
      </div>

      {/* Tablo */}
      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {catalogsQuery.isLoading ? (
          <div className="p-12 text-center text-slate-500">Yükleniyor...</div>
        ) : catalogsQuery.isError ? (
          <div className="p-12 text-center text-rose-600">
            Yüklenemedi: {(catalogsQuery.error as Error).message}
          </div>
        ) : catalogsQuery.data && catalogsQuery.data.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2">Henüz katalog yok</p>
            <Link to="/admin/catalogs/new" className="btn-primary mt-4">
              İlk kataloğu oluştur
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Katalog Adı</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-center">Ürün</th>
                <th className="px-4 py-3 text-center">Müşteri</th>
                <th className="px-4 py-3">Son Güncelleme</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {catalogsQuery.data?.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{c.name}</p>
                      {c.description && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">{c.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(c.status)}`}>
                      {statusLabel(c.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <Package className="h-3.5 w-3.5 text-slate-400" />
                      {c.itemCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      {c.customerCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {new Date(c.updatedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleDownloadPdf(c.id)}
                        disabled={pdfDownloadingId === c.id || c.itemCount === 0}
                        className="rounded p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                        title={c.itemCount === 0 ? 'Önce ürün ekleyin' : 'PDF İndir'}
                      >
                        {pdfDownloadingId === c.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileDown className="h-4 w-4" />
                        )}
                      </button>
                      {c.status === 'active' && (
                        <Link
                          to={`/viewer/${c.id}`}
                          target="_blank"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="Viewer'da Aç"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      )}
                      <button
                        onClick={() => navigate(`/admin/catalogs/${c.id}`)}
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
    </div>
  );
};

export default Catalogs;
