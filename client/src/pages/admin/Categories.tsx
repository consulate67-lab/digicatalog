import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FolderTree, FolderOpen, Edit2, X, Save } from 'lucide-react';
import api from '../../lib/api';

interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Basit kategori yönetimi. Liste + ekleme + silme.
 * (Ağaç görselleştirme Faz 5'te katalog motoruyla birlikte)
 */
const Categories = () => {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () => {
      const res = await api.get<{ data: Category[] }>('/categories?includeInactive=true');
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; slug: string }) => {
      await api.post('/categories', input);
    },
    onSuccess: () => {
      setNewName('');
      setNewSlug('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Ekleme başarısız');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; name: string; slug: string }) => {
      await api.put(`/categories/${input.id}`, { name: input.name, slug: input.slug });
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Güncelleme başarısız');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/categories/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) {
      setError('Ad ve slug zorunludur');
      return;
    }
    createMutation.mutate({ name: newName, slug: newSlug });
  };

  // Otomatik slug öner (henüz boşsa)
  const handleNameChange = (name: string) => {
    setNewName(name);
    if (!newSlug || newSlug === slugify(newName)) {
      setNewSlug(slugify(name));
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditSlug(cat.slug);
    setError(null);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim() || !editSlug.trim()) {
      setError('Ad ve slug zorunludur');
      return;
    }
    updateMutation.mutate({ id, name: editName, slug: editSlug });
  };

  const handleDelete = (cat: Category) => {
    if (confirm(`"${cat.name}" kategorisi silinecek (alt kategoriler de silinir). Devam edilsin mi?`)) {
      deleteMutation.mutate(cat.id);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <FolderTree className="h-6 w-6 text-brand-600" />
          Kategoriler
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Ürünleri sınıflandırmak için hiyerarşik kategoriler oluşturun.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Yeni kategori formu */}
        <div className="card lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Yeni Kategori</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Ad</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Elektronik"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Slug</label>
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="elektronik"
              />
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button type="submit" disabled={createMutation.isPending} className="btn-primary w-full">
              <Plus className="h-4 w-4" />
              Ekle
            </button>
          </form>
        </div>

        {/* Kategori listesi */}
        <div className="card lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Mevcut Kategoriler ({categoriesQuery.data?.length ?? 0})
          </h2>
          {categoriesQuery.isLoading ? (
            <p className="text-sm text-slate-500">Yükleniyor...</p>
          ) : categoriesQuery.data?.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz kategori yok.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {categoriesQuery.data?.map((cat) => (
                <li key={cat.id} className="flex items-center justify-between py-2.5">
                  {editingId === cat.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="text"
                        value={editSlug}
                        onChange={(e) => setEditSlug(e.target.value)}
                        className="w-32 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                      />
                      <button
                        onClick={() => saveEdit(cat.id)}
                        className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                        title="Kaydet"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        title="İptal"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {cat.parentId ? (
                          <FolderTree className="h-4 w-4 text-slate-400" />
                        ) : (
                          <FolderOpen className="h-4 w-4 text-amber-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-slate-900">{cat.name}</p>
                          <p className="font-mono text-xs text-slate-500">/{cat.slug}</p>
                        </div>
                        {!cat.isActive && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            Pasif
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(cat)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="Düzenle"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(cat)}
                          className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          title="Sil"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);

export default Categories;
