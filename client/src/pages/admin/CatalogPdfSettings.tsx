import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Plus,
  Copy,
  Trash2,
  ExternalLink,
  Loader2,
  FileText,
  Share2,
} from 'lucide-react';
import api from '../../lib/api';

/**
 * Catalog PDF Settings + Shares management (Faz 9.5).
 *
 * URL: /admin/catalogs/:id/pdf-settings
 *
 * Iki bolum:
 * 1) PDF Settings: template secici (24 preset + custom), field toggles,
 *    custom cover title + footer text. PUT /api/catalogs/:id/pdf-settings.
 * 2) Shares: aktif share list, yeni share olustur (customer email +
 *    expiresInDays), URL kopyala, revoke.
 *
 * Not: Public viewer endpoint (GET /api/viewer/share/:token) 9.4.3'te
 * backend'de hazir — UI tarafindan URL olusturuluyor.
 */

interface PdfTemplate {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  isSystem: boolean;
}

interface CatalogPdfSettings {
  catalogId: string;
  templateId: string;
  showLogo: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showAddress: boolean;
  showInstagram: boolean;
  showFacebook: boolean;
  showWebsite: boolean;
  showQrCode: boolean;
  customCoverTitle: string | null;
  customFooterText: string | null;
  qrLinkUrl: string | null;
  updatedAt: string;
}

interface CatalogShare {
  id: string;
  catalogId: string;
  customerEmail: string;
  accessToken: string;
  expiresAt: string;
  createdAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
}

const FIELD_TOGGLES: Array<{
  key: keyof Pick<
    CatalogPdfSettings,
    'showLogo' | 'showPhone' | 'showEmail' | 'showAddress' | 'showInstagram' | 'showFacebook' | 'showWebsite' | 'showQrCode'
  >;
  label: string;
}> = [
  { key: 'showLogo', label: 'Logo' },
  { key: 'showPhone', label: 'Telefon' },
  { key: 'showEmail', label: 'E-posta' },
  { key: 'showAddress', label: 'Adres' },
  { key: 'showInstagram', label: 'Instagram' },
  { key: 'showFacebook', label: 'Facebook' },
  { key: 'showWebsite', label: 'Web sitesi' },
  { key: 'showQrCode', label: 'QR Kod' },
];

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('tr-TR');
  } catch {
    return iso;
  }
};

const CatalogPdfSettings = () => {
  const { id } = useParams<{ id: string }>();
  const catalogId = id!;
  const queryClient = useQueryClient();

  // === PDF Settings queries ===
  const settingsQuery = useQuery({
    queryKey: ['pdf-settings', catalogId],
    queryFn: async () => {
      const res = await api.get<{ data: CatalogPdfSettings }>(`/catalogs/${catalogId}/pdf-settings`);
      return res.data.data;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ['pdf-templates-all'],
    queryFn: async () => {
      const res = await api.get<{ data: PdfTemplate[]; pagination: { total: number } }>(
        `/admin/pdf-templates?pageSize=100`,
      );
      return res.data.data ?? [];
    },
  });

  const [draft, setDraft] = useState<Partial<CatalogPdfSettings> | null>(null);
  const current = draft ?? settingsQuery.data ?? null;

  const saveMutation = useMutation({
    mutationFn: async (input: Partial<CatalogPdfSettings>) => {
      const res = await api.put<{ data: CatalogPdfSettings }>(
        `/catalogs/${catalogId}/pdf-settings`,
        input,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdf-settings', catalogId] });
      setDraft(null);
      alert('PDF ayarları kaydedildi');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      alert('Hata: ' + (err.response?.data?.message ?? 'Bilinmeyen'));
    },
  });

  const handleSave = () => {
    if (!current) return;
    saveMutation.mutate({
      templateId: current.templateId,
      showLogo: current.showLogo,
      showPhone: current.showPhone,
      showEmail: current.showEmail,
      showAddress: current.showAddress,
      showInstagram: current.showInstagram,
      showFacebook: current.showFacebook,
      showWebsite: current.showWebsite,
      showQrCode: current.showQrCode,
      customCoverTitle: current.customCoverTitle,
      customFooterText: current.customFooterText,
      qrLinkUrl: current.qrLinkUrl,
    });
  };

  const handleDownloadPdf = async () => {
    if (!current) return;
    try {
      const response = await api.post(
        `/catalogs/${catalogId}/pdf/full`,
        { templateId: current.templateId },
        { responseType: 'blob', timeout: 60_000 },
      );
      const disposition = response.headers['content-disposition'] ?? '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `katalog-${Date.now()}.pdf`;
      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (err) {
      alert('PDF indirilemedi: ' + ((err as Error).message ?? 'bilinmeyen'));
    }
  };

  // === Shares ===
  const sharesQuery = useQuery({
    queryKey: ['shares', catalogId],
    queryFn: async () => {
      const res = await api.get<{ data: CatalogShare[] }>(`/catalogs/${catalogId}/shares`);
      return res.data.data ?? [];
    },
  });

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareForm, setShareForm] = useState({ customerEmail: '', expiresInDays: 30 });
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);

  const createShareMutation = useMutation({
    mutationFn: async (input: { customerEmail: string; expiresInDays: number }) => {
      const res = await api.post<{ data: CatalogShare }>(`/catalogs/${catalogId}/shares`, input);
      return res.data.data;
    },
    onSuccess: (share) => {
      queryClient.invalidateQueries({ queryKey: ['shares', catalogId] });
      setShareDialogOpen(false);
      setShareForm({ customerEmail: '', expiresInDays: 30 });
      const url = `${window.location.origin}/viewer/share/${share.accessToken}`;
      setLastCreatedUrl(url);
      // Auto-copy to clipboard
      navigator.clipboard?.writeText(url).catch(() => {
        /* ignore */
      });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      alert('Hata: ' + (err.response?.data?.message ?? 'Bilinmeyen'));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (shareId: string) => {
      await api.delete(`/catalogs/${catalogId}/shares/${shareId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shares', catalogId] }),
  });

  // === Render ===
  if (settingsQuery.isLoading || templatesQuery.isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!current) {
    return <div className="p-6 text-slate-600">Ayarlar yüklenemedi.</div>;
  }

  const templates = templatesQuery.data ?? [];
  const shares = sharesQuery.data ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/admin/catalogs/${catalogId}`}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            title="Katalog'a don"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">PDF Ayarları ve Paylaşım</h1>
            <p className="text-sm text-slate-500">Katalog: {catalogId.slice(0, 8)}...</p>
          </div>
        </div>
        <button
          onClick={handleDownloadPdf}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <FileText className="h-4 w-4" />
          PDF İndir
        </button>
      </div>

      {/* === PDF Settings === */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
          <FileText className="h-4 w-4 text-brand-600" />
          Şablon ve İçerik
        </h2>

        {/* Template seçici */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">PDF Şablonu</label>
          <select
            value={current.templateId}
            onChange={(e) => setDraft({ ...current, templateId: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.isSystem ? '[Sistem]' : '[Özel]'} {t.name} — {t.category}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {templates.length} şablon mevcut ({templates.filter((t) => t.isSystem).length} sistem + {templates.filter((t) => !t.isSystem).length} özel).
            Şablon yönetimi için <Link to="/admin/catalogs" className="text-brand-600 underline">Kataloglar</Link> sayfasına bakın.
          </p>
        </div>

        {/* Custom cover title */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Özel Kapak Başlığı (opsiyonel)
          </label>
          <input
            type="text"
            value={current.customCoverTitle ?? ''}
            onChange={(e) => setDraft({ ...current, customCoverTitle: e.target.value || null })}
            maxLength={200}
            placeholder="Boş bırakırsanız katalog adı kullanılır"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Custom footer */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Özel Footer Metni (opsiyonel)
          </label>
          <textarea
            value={current.customFooterText ?? ''}
            onChange={(e) => setDraft({ ...current, customFooterText: e.target.value || null })}
            maxLength={2000}
            rows={2}
            placeholder="Footer'da görünecek metin"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* QR link URL */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">QR Kod Link (opsiyonel)</label>
          <input
            type="url"
            value={current.qrLinkUrl ?? ''}
            onChange={(e) => setDraft({ ...current, qrLinkUrl: e.target.value || null })}
            placeholder="https://..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </section>

      {/* === Field toggles === */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">İletişim Bilgileri</h2>
        <p className="mb-4 text-sm text-slate-500">
          Hangi bilgiler PDF'te görünsün? Tenant ayarlarından çekilir, katalog bazında override edilir.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FIELD_TOGGLES.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={Boolean(current[key])}
                onChange={(e) => setDraft({ ...current, [key]: e.target.checked } as CatalogPdfSettings)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-slate-700">{label}</span>
            </label>
          ))}
        </div>

        {/* Save bar */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {draft && (
            <button
              onClick={() => setDraft(null)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              İptal
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!draft || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </button>
        </div>
      </section>

      {/* === Shares === */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Share2 className="h-4 w-4 text-brand-600" />
            Müşteri Paylaşımı
          </h2>
          <button
            onClick={() => setShareDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Yeni Share
          </button>
        </div>

        {lastCreatedUrl && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-1 text-xs font-medium text-emerald-700">Son oluşturulan share URL (panoya kopyalandı):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-700">
                {lastCreatedUrl}
              </code>
              <button
                onClick={() => navigator.clipboard?.writeText(lastCreatedUrl)}
                className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                title="Tekrar kopyala"
              >
                <Copy className="h-4 w-4" />
              </button>
              <Link
                to={`/viewer/share/${lastCreatedUrl.split('/').pop()}`}
                target="_blank"
                className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                title="Yeni sekmede aç"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {sharesQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : shares.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            Henüz share oluşturulmamış. Müşterinize paylaşmak için "Yeni Share" butonuna tıklayın.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Müşteri</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Son Erişim</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Erişim Sayısı</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Bitiş</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-600">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {shares.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-sm text-slate-700">{s.customerEmail}</td>
                    <td className="px-3 py-2 text-sm text-slate-500">
                      {s.lastAccessedAt ? fmtDate(s.lastAccessedAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">{s.accessCount}</td>
                    <td className="px-3 py-2 text-sm text-slate-500">{fmtDate(s.expiresAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`${s.customerEmail} share'ini iptal et?`)) {
                            revokeMutation.mutate(s.id);
                          }
                        }}
                        disabled={revokeMutation.isPending}
                        className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        title="İptal et"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* === Share Create Dialog === */}
      {shareDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Yeni Share Oluştur</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Müşteri E-posta</label>
                <input
                  type="email"
                  value={shareForm.customerEmail}
                  onChange={(e) => setShareForm({ ...shareForm, customerEmail: e.target.value })}
                  placeholder="musteri@firma.com"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Geçerlilik Süresi (gün)</label>
                <select
                  value={shareForm.expiresInDays}
                  onChange={(e) => setShareForm({ ...shareForm, expiresInDays: Number(e.target.value) })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value={7}>7 gün</option>
                  <option value={14}>14 gün</option>
                  <option value={30}>30 gün</option>
                  <option value={60}>60 gün</option>
                  <option value={90}>90 gün</option>
                  <option value={180}>180 gün</option>
                  <option value={365}>365 gün</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setShareDialogOpen(false)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                İptal
              </button>
              <button
                onClick={() => createShareMutation.mutate(shareForm)}
                disabled={!shareForm.customerEmail || createShareMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createShareMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogPdfSettings;
