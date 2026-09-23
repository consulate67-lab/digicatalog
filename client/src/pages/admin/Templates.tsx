import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  FileText,
  Layers,
  Search,
  X,
} from 'lucide-react';
import api from '../../lib/api';

/**
 * PDF Templates management UI (Faz 9.8).
 *
 * URL: /admin/templates
 *
 * - 24 sistem preset'i grid'de göster (read-only badge)
 * - Custom şablon oluşturma / düzenleme / silme (POST/PATCH/DELETE)
 * - Layout config basit form ile (advanced JSON preview)
 */

interface PdfTemplate {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  layout: Record<string, unknown>;
  isSystem: boolean;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateListItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  isSystem: boolean;
}

const CATEGORIES = [
  'classic',
  'modern',
  'minimal',
  'compact',
  'magazine',
  'catalog',
  'brochure',
  'premium',
  'custom',
] as const;

const COVER_STYLES = ['minimal', 'centered', 'full-image', 'magazine', 'gradient'] as const;
const HEADER_STYLES = ['simple', 'bold', 'minimal', 'none'] as const;
const FOOTER_STYLES = ['simple', 'bold', 'minimal'] as const;
const PAGE_SIZES = ['A4', 'A5', 'Letter'] as const;
const ORIENTATIONS = ['portrait', 'landscape'] as const;
const COLUMNS = [1, 2, 3, 4] as const;
const IMAGE_POSITIONS = ['top', 'left', 'right', 'background'] as const;
const IMAGE_ASPECTS = ['1:1', '4:3', '3:2', '16:9'] as const;
const BORDER_STYLES = ['none', 'thin', 'accent', 'shadow'] as const;

interface FormState {
  name: string;
  slug: string;
  description: string;
  category: string;
  // Layout
  pageSize: 'A4' | 'A5' | 'Letter';
  orientation: 'portrait' | 'landscape';
  columns: 1 | 2 | 3 | 4;
  imagePosition: 'top' | 'left' | 'right' | 'background';
  imageAspect: '1:1' | '4:3' | '3:2' | '16:9';
  borderStyle: 'none' | 'thin' | 'accent' | 'shadow';
  coverStyle: 'minimal' | 'centered' | 'full-image' | 'magazine' | 'gradient';
  headerStyle: 'simple' | 'bold' | 'minimal' | 'none';
  footerStyle: 'simple' | 'bold' | 'minimal';
  tocEnabled: boolean;
  groupByCategory: boolean;
  primaryColor: string;
  accentColor: string;
}

const emptyForm = (): FormState => ({
  name: '',
  slug: '',
  description: '',
  category: 'custom',
  pageSize: 'A4',
  orientation: 'portrait',
  columns: 2,
  imagePosition: 'top',
  imageAspect: '4:3',
  borderStyle: 'thin',
  coverStyle: 'minimal',
  headerStyle: 'simple',
  footerStyle: 'simple',
  tocEnabled: true,
  groupByCategory: false,
  primaryColor: '#1F2937',
  accentColor: '#374151',
});

// === Helpers ===

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);

const buildLayout = (f: FormState): Record<string, unknown> => ({
  pageSize: f.pageSize,
  orientation: f.orientation,
  colors: {
    primary: f.primaryColor,
    accent: f.accentColor,
  },
  cover: { style: f.coverStyle, showTitle: true, showLogo: true, showSubtitle: false },
  header: { style: f.headerStyle, showLogo: true, showTenantName: true, showDate: true },
  productCard: {
    columns: f.columns,
    imagePosition: f.imagePosition,
    imageAspectRatio: f.imageAspect,
    borderStyle: f.borderStyle,
    showSku: true,
    showDescription: false,
    showCategory: true,
    showBrand: true,
    showPrice: true,
  },
  footer: { style: f.footerStyle, showPageNumbers: true, showContact: true },
  tableOfContents: { enabled: f.tocEnabled, style: 'simple', groupByCategory: f.groupByCategory },
});

// === Component ===

const Templates = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  // === List ===
  const listQuery = useQuery({
    queryKey: ['pdf-templates-admin', search, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      params.set('pageSize', '100');
      const res = await api.get<{
        data: TemplateListItem[];
        pagination: { total: number };
      }>(`/admin/pdf-templates?${params}`);
      return res.data;
    },
  });

  // === Detail (edit için) ===
  const detailQuery = useQuery({
    queryKey: ['pdf-template-detail', editingId],
    queryFn: async () => {
      if (!editingId) return null;
      const res = await api.get<{ data: PdfTemplate }>(`/admin/pdf-templates/${editingId}`);
      return res.data.data;
    },
    enabled: !!editingId,
  });

  // Edit modu açıldığında form'u doldur
  const openEdit = (t: TemplateListItem) => {
    setEditingId(t.id);
    setShowForm(true);
  };

  // Detail yüklendiğinde form'u hydrate et
  if (detailQuery.data && editingId && form.name === '') {
    const t = detailQuery.data;
    const layout = t.layout;
    const cover = (layout.cover as any) ?? {};
    const header = (layout.header as any) ?? {};
    const pc = (layout.productCard as any) ?? {};
    const footer = (layout.footer as any) ?? {};
    const toc = (layout.tableOfContents as any) ?? {};
    const colors = (layout.colors as any) ?? {};
    setForm({
      name: t.name,
      slug: t.slug,
      description: t.description ?? '',
      category: t.category,
      pageSize: (layout.pageSize as any) ?? 'A4',
      orientation: (layout.orientation as any) ?? 'portrait',
      columns: (pc.columns as any) ?? 2,
      imagePosition: (pc.imagePosition as any) ?? 'top',
      imageAspect: (pc.imageAspectRatio as any) ?? '4:3',
      borderStyle: (pc.borderStyle as any) ?? 'thin',
      coverStyle: cover.style ?? 'minimal',
      headerStyle: header.style ?? 'simple',
      footerStyle: footer.style ?? 'simple',
      tocEnabled: toc.enabled ?? true,
      groupByCategory: toc.groupByCategory ?? false,
      primaryColor: colors.primary ?? '#1F2937',
      accentColor: colors.accent ?? '#374151',
    });
  }

  // === Create / Update ===
  const saveMutation = useMutation({
    mutationFn: async (input: { name: string; slug: string; description: string; category: string; layout: any }) => {
      if (editingId) {
        const res = await api.patch<{ data: PdfTemplate }>(
          `/admin/pdf-templates/${editingId}`,
          input,
        );
        return res.data.data;
      }
      const res = await api.post<{ data: PdfTemplate }>('/admin/pdf-templates', input);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdf-templates-admin'] });
      closeForm();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setFormError(err.response?.data?.message ?? 'Kayıt başarısız');
    },
  });

  // === Delete ===
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/pdf-templates/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pdf-templates-admin'] }),
    onError: (err: { response?: { data?: { message?: string } } }) => {
      alert('Silme hatası: ' + (err.response?.data?.message ?? 'bilinmeyen'));
    },
  });

  // === Form handlers ===
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const handleSubmit = () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('Ad gerekli');
      return;
    }
    if (!editingId && !form.slug.trim()) {
      setFormError('Slug gerekli');
      return;
    }
    const finalSlug = form.slug.trim() || slugify(form.name);
    saveMutation.mutate({
      name: form.name.trim(),
      slug: finalSlug,
      description: form.description.trim() || null as any,
      category: form.category,
      layout: buildLayout(form),
    });
  };

  const handleDelete = (t: TemplateListItem) => {
    if (t.isSystem) {
      alert('Sistem şablonları silinemez');
      return;
    }
    if (confirm(`"${t.name}" şablonunu silmek istediğinize emin misiniz?`)) {
      deleteMutation.mutate(t.id);
    }
  };

  // === Render ===
  const items = listQuery.data?.data ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Layers className="h-6 w-6 text-brand-600" />
            PDF Şablonları
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Katalog PDF'leri için şablon yönetimi. 24 sistem preset + kendi özel şablonlarınız.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm());
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Yeni Şablon
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Arama</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Şablon adı veya açıklama..."
              className="block w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Kategori</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Tümü</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto self-end text-xs text-slate-500">
          {listQuery.data?.pagination.total ?? '—'} şablon
        </div>
      </div>

      {/* Grid */}
      {listQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">Şablon bulunamadı.</p>
          <button
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm());
              setShowForm(true);
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            İlk şablonu oluştur
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((t) => (
            <div
              key={t.id}
              className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Badges */}
              <div className="mb-2 flex items-center gap-1.5">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                  {t.category}
                </span>
                {t.isSystem ? (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                    📐 Sistem
                  </span>
                ) : (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                    ✏️ Özel
                  </span>
                )}
              </div>

              {/* Name + slug */}
              <h3 className="line-clamp-1 text-base font-semibold text-slate-900">{t.name}</h3>
              <p className="mt-0.5 font-mono text-xs text-slate-400">{t.slug}</p>

              {/* Description */}
              {t.description && (
                <p className="mt-2 line-clamp-2 text-xs text-slate-600">{t.description}</p>
              )}

              {/* Actions */}
              <div className="mt-3 flex items-center justify-end gap-1 border-t border-slate-100 pt-3">
                <button
                  onClick={() => openEdit(t)}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  title={t.isSystem ? 'Görüntüle' : 'Düzenle'}
                >
                  <Edit className="h-4 w-4" />
                </button>
                {!t.isSystem && (
                  <button
                    onClick={() => handleDelete(t)}
                    disabled={deleteMutation.isPending}
                    className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    title="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === Create/Edit Modal === */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Şablonu Düzenle' : 'Yeni Şablon'}
              </h2>
              <button onClick={closeForm} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-6">
              {/* Basic fields */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Ad *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => {
                      setForm({
                        ...form,
                        name: e.target.value,
                        // slug sadece create modunda auto-generate
                        slug: editingId ? form.slug : slugify(e.target.value),
                      });
                    }}
                    disabled={editingId !== null}
                    placeholder="Modern — Bold"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  {editingId !== null && (
                    <p className="mt-1 text-xs text-slate-500">Ad düzenlemede kilitli</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Slug {!editingId && '*'}
                  </label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    disabled={editingId !== null}
                    placeholder="modern-bold"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    a-z, 0-9, tire. Slug düzenlemede kilitli.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Açıklama</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Koyu başlık, vibrant indigo, 2 kolon..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kategori</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Sayfa Boyutu</label>
                  <div className="flex gap-2">
                    <select
                      value={form.pageSize}
                      onChange={(e) => setForm({ ...form, pageSize: e.target.value as any })}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      {PAGE_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <select
                      value={form.orientation}
                      onChange={(e) => setForm({ ...form, orientation: e.target.value as any })}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      {ORIENTATIONS.map((o) => (
                        <option key={o} value={o}>
                          {o === 'portrait' ? 'Dikey' : 'Yatay'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Layout fields */}
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
                Layout Ayarları
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kapak</label>
                  <select
                    value={form.coverStyle}
                    onChange={(e) => setForm({ ...form, coverStyle: e.target.value as any })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {COVER_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Header</label>
                  <select
                    value={form.headerStyle}
                    onChange={(e) => setForm({ ...form, headerStyle: e.target.value as any })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {HEADER_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Footer</label>
                  <select
                    value={form.footerStyle}
                    onChange={(e) => setForm({ ...form, footerStyle: e.target.value as any })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {FOOTER_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kolon Sayısı</label>
                  <select
                    value={form.columns}
                    onChange={(e) => setForm({ ...form, columns: Number(e.target.value) as any })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {COLUMNS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Resim Pozisyonu</label>
                  <select
                    value={form.imagePosition}
                    onChange={(e) => setForm({ ...form, imagePosition: e.target.value as any })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {IMAGE_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Resim Oranı</label>
                  <select
                    value={form.imageAspect}
                    onChange={(e) => setForm({ ...form, imageAspect: e.target.value as any })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {IMAGE_ASPECTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Border</label>
                  <select
                    value={form.borderStyle}
                    onChange={(e) => setForm({ ...form, borderStyle: e.target.value as any })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {BORDER_STYLES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Primary Renk</label>
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="h-10 w-full rounded-md border border-slate-300"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Accent Renk</label>
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                    className="h-10 w-full rounded-md border border-slate-300"
                  />
                </div>

                <label className="flex items-center gap-2 self-end">
                  <input
                    type="checkbox"
                    checked={form.tocEnabled}
                    onChange={(e) => setForm({ ...form, tocEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <span className="text-sm text-slate-700">İçindekiler (TOC)</span>
                </label>
                <label className="flex items-center gap-2 self-end">
                  <input
                    type="checkbox"
                    checked={form.groupByCategory}
                    onChange={(e) => setForm({ ...form, groupByCategory: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <span className="text-sm text-slate-700">Kategoriye göre grupla</span>
                </label>
              </div>

              {/* Error */}
              {formError && (
                <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
              <button
                onClick={closeForm}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                İptal
              </button>
              <button
                onClick={handleSubmit}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? 'Güncelle' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Templates;
