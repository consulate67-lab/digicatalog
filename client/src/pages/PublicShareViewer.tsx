import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Loader2,
  AlertTriangle,
  Clock,
  Mail,
  Package,
} from 'lucide-react';
import api from '../lib/api';

/**
 * Public catalog share viewer (Faz 9.6).
 *
 * URL: /viewer/share/:token
 * NO auth — musteri tarafi.
 * Backend: GET /api/viewer/share/:token (Faz 9.4.3).
 *
 * Customer'a gonderilen share URL'ine tiklayinca bu sayfa acilir.
 * Minimal veri gosterir (sku/name/price/image) — backend'de
 * description/brand/category/notes HARIC tutulur (musteri sadece
 * temel bilgileri gorur).
 *
 * Response shape (PublicSharedCatalogDTO):
 *   {
 *     shareId, catalogId, catalogName, customerEmail, expiresAt,
 *     catalog: { id, name, description, items: [{ id, product: {...} }] }
 *   }
 */

interface PublicItem {
  id: string;
  product: {
    sku: string;
    name: string;
    price: number;
    currency: string;
    primaryImage: { base64Data: string; mimeType: string } | null;
  };
}

interface PublicSharedCatalogDTO {
  shareId: string;
  catalogId: string;
  catalogName: string;
  customerEmail: string;
  expiresAt: string;
  catalog: {
    id: string;
    name: string;
    description: string | null;
    items: PublicItem[];
  };
}

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

const fmtPrice = (n: number, currency: string): string => {
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

const PublicShareViewer = () => {
  const { token } = useParams<{ token: string }>();

  const query = useQuery({
    queryKey: ['public-share', token],
    queryFn: async () => {
      const res = await api.get<{ data: PublicSharedCatalogDTO }>(
        `/viewer/share/${token}`,
      );
      return res.data.data;
    },
    retry: false, // 404/410 retry etmesin
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (query.isError) {
    const err = query.error as {
      response?: { status?: number; data?: { message?: string } };
    };
    const status = err.response?.status;
    const message = err.response?.data?.message ?? 'Bu share görüntülenemiyor';

    let title = 'Erişim Hatası';
    if (status === 404) title = 'Paylaşım Bulunamadı';
    else if (status === 410) title = 'Paylaşım Süresi Dolmuş';

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{message}</p>
          <p className="mt-4 text-xs text-slate-400">
            Paylaşım linkinin doğru olduğundan ve süresinin dolmadığından emin olun.
          </p>
        </div>
      </div>
    );
  }

  if (!query.data) return null;

  const data = query.data;
  const items = data.catalog.items;
  const total = items.length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* === Header === */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-600">
                <BookOpen className="h-3.5 w-3.5" />
                DijiCatalog Paylaşım
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
                {data.catalogName}
              </h1>
              {data.catalog.description && (
                <p className="mt-2 text-sm text-slate-600">{data.catalog.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {data.customerEmail}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Geçerli: {fmtDate(data.expiresAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {total} ürün
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* === Products === */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {total === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center">
            <Package className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-600">Bu katalogda henüz ürün yok.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => {
              const p = item.product;
              const imgSrc = p.primaryImage
                ? `data:${p.primaryImage.mimeType};base64,${p.primaryImage.base64Data}`
                : null;
              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  {/* Image */}
                  <div className="aspect-square w-full overflow-hidden bg-slate-100">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={p.name}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <Package className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  {/* Body */}
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{p.sku}</p>
                    <p className="mt-2 text-base font-semibold text-brand-600">
                      {fmtPrice(p.price, p.currency)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* === Footer === */}
      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
          <p>
            Bu katalog <Link to="/" className="text-brand-600 hover:underline">DijiCatalog</Link>{' '}
            tarafından oluşturulmuştur.
          </p>
          <p className="mt-1">
            Paylaşım ID: <code className="font-mono">{data.shareId.slice(0, 8)}</code>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PublicShareViewer;
