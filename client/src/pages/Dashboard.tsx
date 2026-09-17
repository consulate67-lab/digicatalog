import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User as UserIcon, Building2, Shield, Package, Users, BookOpenCheck, Plug, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import api from '../lib/api';
import type { User, Tenant } from '../store/auth';

/**
 * Dashboard — protected landing. Login sonrası ilk sayfa.
 *
 * Faz 1: kullanıcı + tenant bilgisi + admin quick links + logout.
 * Faz 2'den itibaren: ürün sayısı, son kataloglar, istatistikler.
 */
const Dashboard = () => {
  const navigate = useNavigate();
  const { user, tenant, tokens, clear, setUser } = useAuthStore();

  // Sayfa açıldığında /me'yi çağır, user + tenant güncelle
  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await api.get<{ user: User; tenant: Tenant }>('/auth/me');
        setUser(res.data.user, res.data.tenant);
      } catch {
        // 401 → api.ts interceptor logout + redirect yapacak
      }
    };
    if (user && tokens) {
      void fetchMe();
    }
  }, [user, tokens, setUser]);

  const handleLogout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  if (!user) {
    return null;
  }

  const quickLinks = [
    { to: '/admin/products', icon: Package, title: 'Ürünler', desc: 'Ürün kütüphanesini yönet' },
    { to: '/admin/customers', icon: Users, title: 'Müşteriler', desc: 'Müşteri kartlarını yönet' },
    { to: '/admin/catalogs', icon: BookOpenCheck, title: 'Kataloglar', desc: 'Katalog oluştur ve düzenle' },
    { to: '/admin/integrations', icon: Plug, title: 'ERP Ayarları', desc: 'Korgün ERP entegrasyonu' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Hoş geldin, {user.name}!</h1>
          <p className="mt-2 text-slate-600">
            DijiCatalog paneline giriş yaptın. Aşağıda hesap bilgilerin ve hızlı erişim linklerin var.
          </p>
        </div>
        <button onClick={handleLogout} className="btn-secondary">
          <LogOut className="h-4 w-4" />
          Çıkış Yap
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <UserIcon className="h-4 w-4" />
            Kullanıcı
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-lg font-semibold text-slate-900">{user.name}</p>
            <p className="text-sm text-slate-600">{user.email}</p>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Building2 className="h-4 w-4" />
            Firma (Tenant)
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-lg font-semibold text-slate-900">
              {tenant?.name || '—'}
            </p>
            <p className="text-sm text-slate-600">
              {tenant?.slug ? `/${tenant.slug}` : '—'}
            </p>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Shield className="h-4 w-4" />
            Rol
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-lg font-semibold capitalize text-slate-900">{user.role}</p>
            <p className="text-sm text-slate-600">
              {user.role === 'admin' ? 'Tam yetki' : 'Üye (CRUD)'}
            </p>
          </div>
        </div>
      </div>

      {/* Admin quick links */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Hızlı Erişim</h2>
        <p className="mt-1 text-sm text-slate-600">Admin panelindeki tüm bölümlere buradan ulaşabilirsin.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className="card group border-slate-200 transition-all hover:border-brand-300 hover:shadow-md"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-900">{link.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{link.desc}</p>
                <div className="mt-3 inline-flex items-center text-sm font-medium text-brand-600 group-hover:text-brand-700">
                  Aç <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
