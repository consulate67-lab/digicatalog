import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, Building2, Shield } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import api from '../lib/api';
import type { User, Tenant } from '../store/auth';

/**
 * Dashboard — protected landing. Login sonrası ilk sayfa.
 *
 * Faz 1'de sadece kullanıcı + tenant bilgisi + logout.
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Hoş geldin, {user.name}!</h1>
          <p className="mt-2 text-slate-600">
            DijiCatalog paneline giriş yaptın. Aşağıda hesap bilgilerin var.
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

      <div className="card mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Faz 1 — Auth & Multi-tenant ✅</h2>
        <p className="mt-2 text-sm text-slate-600">
          Multi-tenant mimari kuruldu. Her istek JWT ile doğrulanıyor,
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">req.user.tenantId</code>
          row-level filter için hazır.
        </p>
        <ul className="mt-4 space-y-1 text-sm text-slate-600">
          <li>✅ tenants + users schema + migration</li>
          <li>✅ register / login / refresh / me endpoint'leri</li>
          <li>✅ JWT access (15dk) + refresh (7g) token</li>
          <li>✅ Zustand auth store + localStorage persist</li>
          <li>✅ Axios JWT + 401 refresh interceptor</li>
          <li>✅ Protected route guard</li>
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;
