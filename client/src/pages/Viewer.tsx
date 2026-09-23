import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  ImageIcon,
  FileText,
  Eye,
  Download,
} from 'lucide-react';
import api from '../lib/api';

interface ViewerFieldConfig {
  fieldName: string;
  label: string;
  isVisible: boolean;
  sortOrder: number;
}

interface ViewerCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
}

interface ViewerProductImage {
  id: string;
  base64Data: string;
  mimeType: string;
  sortOrder: number;
  isPrimary: boolean;
}

interface ViewerProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: { id: string; name: string; slug: string } | null;
  brand: string | null;
  unit: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  sortOrder: number;
  images: ViewerProductImage[];
  customPrice: number | null;
  customNotes: string | null;
}

interface ViewerResponse {
  catalog: { id: string; name: string; description: string | null };
  fieldConfig: ViewerFieldConfig[];
  categories: ViewerCategory[];
  products: ViewerProduct[];
  customerCount: number;
  createdAt: string;
}

interface PdfTemplate {
  id: string;
  name: string;
  slug: string;
  category: string;
  isSystem: boolean;
}

const isVisible = (cfg: ViewerFieldConfig[], name: string): boolean => {
  const f = cfg.find((c) => c.fieldName === name);
  return f ? f.isVisible : true;
};

const sortByVisibleOrder = (cfg: ViewerFieldConfig[]): ViewerFieldConfig[] =>
  [...cfg].filter((f) => f.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * Public viewer — müşteri ziyaretinde açılan katalog sayfası.
 *
 * Auth gerektirmez, link-based paylaşım. Sadece 'active' kataloglar
 * görüntülenir (server tarafında 404).
 *
 * Faz 9.7: PDF indir + preview butonları eklendi. Template seçici
 * ile admin hangi template'i kullanacağını seçebilir (görsel karşılaştırma
 * için).
 *
 * Layout:
 * - Üst bar: katalog adı + açıklama + template seçici + PDF butonları
 * - Sol sidebar: kategori ağacı (chip'ler)
 * - Ana içerik: ürün grid (field config'e göre)
 * - Ürün tıklayınca modal: büyük resim + tüm özellikler + fiyat + notlar
 */
const Viewer = () => {
  const { catalogId } = useParams<{ catalogId: string }>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ViewerProduct | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Scroll lock when modal is open
  useEffect(() => {
    if (selectedProduct || previewOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedProduct, previewOpen]);

  // Close modal on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedProduct) setSelectedProduct(null);
        if (previewOpen) closePreview();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, previewOpen]);

  // Cleanup blob URL on unmount or when closing preview
  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewOpen(false);
  };

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const viewerQuery = useQuery({
    queryKey: ['viewer', catalogId],
    queryFn: async () => {
      const res = await api.get<{ data: ViewerResponse }>(`/viewer/${catalogId}`);
      return res.data.data;
    },
    enabled: !!catalogId,
    retry: false,
  });

  // PDF templates listesi — public endpoint (Faz 9.9 — auth'sız)
  // viewer.tsx public oldugu icin admin endpoint'i kullanamaz (401).
  const templatesQuery = useQuery({
    queryKey: ['pdf-templates-public'],
    queryFn: async () => {
      const res = await api.get<{ data: PdfTemplate[] }>(
        `/public/templates`,
      );
      return res.data.data ?? [];
    },
  });

  // Katalog için seçili template — public endpoint (Faz 9.9 — auth'sız)
  const settingsQuery = useQuery({
    queryKey: ['public-pdf-settings', catalogId],
    queryFn: async () => {
      const res = await api.get<{ data: { templateId: string } }>(
        `/public/catalogs/${catalogId}/pdf-settings`,
      );
      return res.data.data;
    },
    enabled: !!catalogId,
  });

  // Initial templateId'i settings'ten al
  useEffect(() => {
    if (settingsQuery.data?.templateId && !selectedTemplateId) {
      setSelectedTemplateId(settingsQuery.data.templateId);
    }
  }, [settingsQuery.data, selectedTemplateId]);

  // Visible fields (sıralı)
  const visibleFields = useMemo(
    () => (viewerQuery.data ? sortByVisibleOrder(viewerQuery.data.fieldConfig) : []),
    [viewerQuery.data],
  );

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (!viewerQuery.data) return [];
    if (!selectedCategoryId) return viewerQuery.data.products;
    return viewerQuery.data.products.filter(
      (p) => p.category?.id === selectedCategoryId,
    );
  }, [viewerQuery.data, selectedCategoryId]);

  // PDF indir — mevcut downloadCatalogPdf helper'i templateId desteklemiyor,
  // bu yuzden inline axios kullaniyoruz.
  const handleDownloadPdf = async () => {
    if (!catalogId) return;
    setPdfError(null);
    setPdfDownloading(true);
    try {
      const response = await api.post(
        `/catalogs/${catalogId}/pdf/full`,
        { templateId: selectedTemplateId || null },
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
      setPdfError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'PDF oluşturulamadı',
      );
    } finally {
      setPdfDownloading(false);
    }
  };

  // PDF önizle — blob URL al, modal iframe'de göster
  const handlePreviewPdf = async () => {
    if (!catalogId) return;
    setPdfError(null);
    setPdfDownloading(true);
    try {
      const response = await api.post(
        `/catalogs/${catalogId}/pdf/full`,
        { templateId: selectedTemplateId || null },
        { responseType: 'blob', timeout: 60_000 },
      );
      const blob = response.data as Blob;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (err) {
      setPdfError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'PDF önizlenemedi',
      );
    } finally {
      setPdfDownloading(false);
    }
  };

  if (viewerQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (viewerQuery.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <BookOpen className="h-16 w-16 text-slate-300" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Katalog Bulunamadı</h1>
        <p className="mt-2 text-slate-600">
          Bu katalog mevcut değil, taslak durumda veya arşivlenmiş olabilir.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {(viewerQuery.error as { response?: { data?: { message?: string } } })?.response?.data?.message}
        </p>
      </div>
    );
  }

  const data = viewerQuery.data!;
  const templates = templatesQuery.data ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-1 h-7 w-7 flex-shrink-0 text-brand-600" />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900">{data.catalog.name}</h1>
              {data.catalog.description && (
                <p className="mt-1 text-sm text-slate-600">{data.catalog.description}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                {data.products.length} ürün · {data.customerCount} müşteri
              </p>
            </div>

            {/* === PDF Actions (Faz 9.7) === */}
            <div className="flex flex-shrink-0 flex-col items-end gap-2">
              {pdfError && (
                <p className="text-xs text-rose-600">{pdfError}</p>
              )}
              <div className="flex items-center gap-2">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={templatesQuery.isLoading}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  title="PDF şablonu seç"
                >
                  {templatesQuery.isLoading ? (
                    <option>Yükleniyor...</option>
                  ) : templates.length === 0 ? (
                    <option value="">Şablon yok</option>
                  ) : (
                    <>
                      <option value="">Varsayılan</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.isSystem ? '📐' : '✏️'} {t.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <button
                  onClick={handlePreviewPdf}
                  disabled={pdfDownloading || data.products.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title="PDF'i tarayıcıda önizle"
                >
                  {pdfDownloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  Önizle
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={pdfDownloading || data.products.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="PDF'i indir"
                >
                  {pdfDownloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  PDF İndir
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                {data.products.length === 0 ? 'Önce ürün ekleyin' : 'Seçili template ile oluşturulur'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        {/* Sidebar: Kategoriler */}
        <aside className="w-60 flex-shrink-0">
          <div className="sticky top-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Kategoriler
            </h2>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selectedCategoryId === null
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>Tümü</span>
                  <span className="text-xs text-slate-500">{data.products.length}</span>
                </button>
              </li>
              {data.categories.map((cat) => (
                <li key={cat.id}>
                  <button
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      selectedCategoryId === cat.id
                        ? 'bg-brand-50 font-medium text-brand-700'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{cat.productCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main: Ürün grid */}
        <main className="flex-1">
          {filteredProducts.length === 0 ? (
            <div className="card text-center text-slate-500">
              <ImageIcon className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-2">Bu kategoride ürün yok</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  visibleFields={visibleFields}
                  onClick={() => setSelectedProduct(p)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Product Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          visibleFields={visibleFields}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* PDF Preview Modal (Faz 9.7) */}
      {previewOpen && previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4">
          <div className="mb-3 flex items-center justify-between rounded-md bg-slate-900 px-4 py-2 text-white">
            <span className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              PDF Önizleme
              {selectedTemplateId && templates.find((t) => t.id === selectedTemplateId) && (
                <span className="text-xs text-slate-400">
                  ({templates.find((t) => t.id === selectedTemplateId)?.name})
                </span>
              )}
            </span>
            <button
              onClick={closePreview}
              className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Kapat</span>
            </button>
          </div>
          <iframe
            src={previewUrl}
            title="PDF Önizleme"
            className="flex-1 rounded-md bg-white shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};

// === Product Card ===

interface ProductCardProps {
  product: ViewerProduct;
  visibleFields: ViewerFieldConfig[];
  onClick: () => void;
}

const ProductCard = ({ product, visibleFields, onClick }: ProductCardProps) => {
  const primary = product.images.find((i) => i.isPrimary) ?? product.images[0];
  const showSku = isVisible(visibleFields, 'sku');
  const showPrice = isVisible(visibleFields, 'price');
  const showCurrency = isVisible(visibleFields, 'currency');
  const showBrand = isVisible(visibleFields, 'brand');
  const showCategory = isVisible(visibleFields, 'category');

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Image */}
      <div className="aspect-square overflow-hidden bg-slate-100">
        {primary ? (
          <img
            src={`data:${primary.mimeType};base64,${primary.base64Data}`}
            alt={product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageIcon className="h-16 w-16" />
          </div>
        )}
      </div>
      {/* Info */}
      <div className="space-y-1.5 p-4">
        {showCategory && product.category && (
          <p className="text-xs font-medium uppercase tracking-wider text-brand-600">
            {product.category.name}
          </p>
        )}
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{product.name}</h3>
        {showSku && (
          <p className="font-mono text-xs text-slate-500">{product.sku}</p>
        )}
        <div className="flex items-baseline justify-between gap-2 pt-1">
          {showPrice ? (
            <p className="text-lg font-bold tabular-nums text-slate-900">
              {product.price.toLocaleString('tr-TR')}
              {showCurrency && <span className="ml-1 text-xs font-normal text-slate-500">{product.currency}</span>}
            </p>
          ) : (
            <span />
          )}
          {showBrand && product.brand && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {product.brand}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// === Product Modal ===

interface ProductModalProps {
  product: ViewerProduct;
  visibleFields: ViewerFieldConfig[];
  onClose: () => void;
}

const ProductModal = ({ product, visibleFields, onClose }: ProductModalProps) => {
  const [imageIndex, setImageIndex] = useState(0);
  const currentImage = product.images[imageIndex] ?? null;

  const nextImage = () => {
    if (product.images.length === 0) return;
    setImageIndex((i) => (i + 1) % product.images.length);
  };
  const prevImage = () => {
    if (product.images.length === 0) return;
    setImageIndex((i) => (i - 1 + product.images.length) % product.images.length);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Left: Image carousel */}
        <div className="relative flex flex-shrink-0 items-center justify-center bg-slate-100 md:w-1/2">
          {currentImage ? (
            <>
              <img
                src={`data:${currentImage.mimeType};base64,${currentImage.base64Data}`}
                alt={product.name}
                className="max-h-[60vh] w-full object-contain md:max-h-[90vh]"
              />
              {product.images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-md transition-colors hover:bg-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-md transition-colors hover:bg-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-white">
                    {imageIndex + 1} / {product.images.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex h-72 w-full items-center justify-center text-slate-300 md:h-full">
              <ImageIcon className="h-24 w-24" />
            </div>
          )}
        </div>

        {/* Right: Details */}
        <div className="flex-1 overflow-y-auto p-6">
          {isVisible(visibleFields, 'category') && product.category && (
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              {product.category.name}
            </p>
          )}
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{product.name}</h2>

          {isVisible(visibleFields, 'price') && (
            <div className="mt-4">
              <p className="text-3xl font-bold tabular-nums text-slate-900">
                {product.price.toLocaleString('tr-TR')}
                {isVisible(visibleFields, 'currency') && (
                  <span className="ml-2 text-base font-normal text-slate-500">{product.currency}</span>
                )}
              </p>
              {product.customPrice !== null && (
                <p className="mt-1 text-xs text-emerald-600">
                  Özel fiyat (katalog için)
                </p>
              )}
            </div>
          )}

          {isVisible(visibleFields, 'sku') && (
            <DetailRow label="SKU" value={product.sku} mono />
          )}
          {isVisible(visibleFields, 'brand') && product.brand && (
            <DetailRow label="Marka" value={product.brand} />
          )}
          {isVisible(visibleFields, 'unit') && product.unit && (
            <DetailRow label="Birim" value={product.unit} />
          )}
          {isVisible(visibleFields, 'description') && product.description && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Açıklama</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{product.description}</p>
            </div>
          )}
          {isVisible(visibleFields, 'notes') && product.notes && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notlar</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{product.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="mt-2 flex items-baseline gap-2 text-sm">
    <span className="text-slate-500">{label}:</span>
    <span className={mono ? 'font-mono text-slate-900' : 'text-slate-900'}>{value}</span>
  </div>
);

export default Viewer;
