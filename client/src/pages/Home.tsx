import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import api from '../lib/api';

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
}

/**
 * Landing sayfası. Server'ın /api/ping'ine istek atar, sonucu gösterir.
 * Sağlık check buradan da görülebilir → Faz 0 demo için ideal.
 *
 * Faz 1'den itibaren /login'e yönlendirilecek (auth context'e göre).
 */
const Home = () => {
  const { data, isLoading, isError, error, refetch } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.get<HealthResponse>('/ping');
      return res.data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          DijiCatalog
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Kiralanabilir dijital katalog SaaS — ürünlerinizi kategorilere göre kataloglayın,
          müşteri ziyaretlerinde gösterin, tek tuşla PDF olarak paylaşın.
        </p>
      </section>

      {/* Phase roadmap */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold text-slate-900">Geliştirme Yol Haritası</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { faz: 0, ad: 'Altyapı', durum: 'devam ediyor', renk: 'amber' },
            { faz: 1, ad: 'Auth & Multi-tenant', durum: 'bekliyor', renk: 'slate' },
            { faz: 2, ad: 'Ürün Yönetimi', durum: 'bekliyor', renk: 'slate' },
            { faz: 5, ad: 'Katalog Motoru', durum: 'bekliyor', renk: 'slate' },
            { faz: 6, ad: 'Viewer + Modal', durum: 'bekliyor', renk: 'slate' },
            { faz: 7, ad: 'PDF Üretimi', durum: 'bekliyor', renk: 'slate' },
            { faz: 8, ad: 'Railway Deploy', durum: 'bekliyor', renk: 'slate' },
          ].map((item) => (
            <div key={item.faz} className="card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Faz {item.faz}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.renk === 'amber'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.durum}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-slate-900">{item.ad}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* Health check */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold text-slate-900">Sağlık Durumu</h2>
        <div className="card mt-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Backend kontrol ediliyor...</span>
            </div>
          )}

          {isError && (
            <div className="flex items-start gap-2 text-rose-600">
              <XCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Backend'e bağlanılamadı</p>
                <p className="mt-1 text-sm text-rose-500">
                  {(error as Error)?.message || 'Bilinmeyen hata'}
                </p>
                <button onClick={() => refetch()} className="btn-secondary mt-3">
                  Tekrar Dene
                </button>
              </div>
            </div>
          )}

          {data && (
            <div>
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Tüm servisler çalışıyor</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Servis</dt>
                  <dd className="font-mono text-slate-900">{data.service}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Versiyon</dt>
                  <dd className="font-mono text-slate-900">v{data.version}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Uptime</dt>
                  <dd className="font-mono text-slate-900">{Math.floor(data.uptime)}s</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Son kontrol</dt>
                  <dd className="font-mono text-slate-900">
                    {new Date(data.timestamp).toLocaleTimeString('tr-TR')}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
