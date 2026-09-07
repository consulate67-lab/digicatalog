import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, ArrowLeft } from 'lucide-react';
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
  notes: string | null;
  isActive: boolean;
}

const CustomerForm = ({ mode }: { mode: 'create' | 'edit' }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();

  const [form, setForm] = useState({
    name: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    taxNumber: '',
    taxOffice: '',
    notes: '',
    isActive: true,
  });
  const [error, setError] = useState<string | null>(null);

  const customerQuery = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const res = await api.get<{ data: CustomerDTO }>(`/customers/${id}`);
      return res.data.data;
    },
    enabled: mode === 'edit' && !!id,
  });

  useEffect(() => {
    if (customerQuery.data) {
      const c = customerQuery.data;
      setForm({
        name: c.name,
        contactName: c.contactName ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        address: c.address ?? '',
        taxNumber: c.taxNumber ?? '',
        taxOffice: c.taxOffice ?? '',
        notes: c.notes ?? '',
        isActive: c.isActive,
      });
    }
  }, [customerQuery.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = cleanPayload();
      const res = await api.post<{ data: CustomerDTO }>('/customers', payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/admin/customers');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Kayıt başarısız');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload = cleanPayload();
      await api.put(`/customers/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      navigate('/admin/customers');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Güncelleme başarısız');
    },
  });

  const cleanPayload = () => ({
    name: form.name,
    contactName: emptyToNull(form.contactName),
    email: emptyToNull(form.email),
    phone: emptyToNull(form.phone),
    address: emptyToNull(form.address),
    taxNumber: emptyToNull(form.taxNumber),
    taxOffice: emptyToNull(form.taxOffice),
    notes: emptyToNull(form.notes),
    isActive: form.isActive,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('Firma adı zorunludur');
      return;
    }
    if (form.email && !/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) {
      setError('Geçerli bir email girin');
      return;
    }
    if (mode === 'create') createMutation.mutate();
    else updateMutation.mutate();
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (mode === 'edit' && customerQuery.isLoading) {
    return <div className="text-slate-500">Yükleniyor...</div>;
  }
  if (mode === 'edit' && customerQuery.isError) {
    return (
      <div className="text-rose-600">
        Yüklenemedi: {(customerQuery.error as Error).message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate('/admin/customers')} className="rounded p-1.5 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-500" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === 'create' ? 'Yeni Müşteri' : 'Müşteriyi Düzenle'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Temel Bilgiler</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">
                  Firma Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Acme Tekstil A.Ş."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">İlgili Kişi</label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Mehmet Yılmaz"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Telefon</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="+90 212 555 0000"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="info@firma.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Adres</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Atatürk Cd. No:1, Beşiktaş / İstanbul"
                />
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Vergi Bilgileri</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Vergi Numarası (VKN/TCKN)</label>
                <input
                  type="text"
                  value={form.taxNumber}
                  onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Vergi Dairesi</label>
                <input
                  type="text"
                  value={form.taxOffice}
                  onChange={(e) => setForm({ ...form, taxOffice: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Beşiktaş"
                />
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Notlar</h2>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Müşteri ziyaret notları, özel istekler, vs."
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Durum</h2>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">Aktif (kataloglarda kullanılabilir)</span>
            </label>
          </div>
        </div>

        <div className="lg:col-span-3">
          {error && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => navigate('/admin/customers')} className="btn-secondary" disabled={isSubmitting}>
              İptal
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Kaydediliyor...' : mode === 'create' ? 'Oluştur' : 'Güncelle'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

const emptyToNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export default CustomerForm;
