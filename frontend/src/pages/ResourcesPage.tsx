import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import FormError from '../components/FormError';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import type { Resource } from '../types/api';

export default function ResourcesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const orgId = user?.organizationId ?? '';

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: '', availability: '', rate: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      setError('Belum tergabung dengan organisasi mana pun.');
      return;
    }
    (async () => {
      try {
        const res = await api.get(`/resources?organizationId=${orgId}`);
        setResources((res.data as { data?: Resource[] }).data ?? []);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  async function handleCreate() {
    if (!form.name.trim()) {
      setCreateError('Nama sumber daya wajib diisi.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const payload = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || null,
        role: form.role || undefined,
        availability: form.availability || undefined,
        rate: form.rate ? Number(form.rate) : null,
        notes: form.notes || null,
      };
      const res = await api.post(`/resources?organizationId=${orgId}`, payload);
      const created = (res.data as { data?: Resource }).data;
      if (created) setResources((prev) => [...prev, created]);
      setShowForm(false);
      setForm({ name: '', email: '', phone: '', role: '', availability: '', rate: '', notes: '' });
      addToast('Sumber daya berhasil dibuat.', 'success');
    } catch (err) {
      setCreateError(formatApiError(err));
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat sumber daya...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sumber Daya</h1>
        {orgId && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Sumber daya baru
            </span>
          </button>
        )}
      </div>

      {error && <FormError error={error} />}

      {showForm && (
        <div className="mb-6 card p-5">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Buat sumber daya</h3>
          <FormError error={createError} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div>
              <label htmlFor="res-name" className="label">Nama <span className="text-red-500">*</span></label>
              <input
                id="res-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="res-role" className="label">Peran</label>
              <input
                id="res-role"
                type="text"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="input"
                placeholder="Contoh: Koordinator panggung"
              />
            </div>
            <div>
              <label htmlFor="res-email" className="label">Email</label>
              <input
                id="res-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="res-phone" className="label">Telepon</label>
              <input
                id="res-phone"
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="res-rate" className="label">Tarif (Rp, opsional)</label>
              <input
                id="res-rate"
                type="number"
                min="0"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                className="input"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="res-availability" className="label">Ketersediaan</label>
              <input
                id="res-availability"
                type="text"
                value={form.availability}
                onChange={(e) => setForm({ ...form, availability: e.target.value })}
                className="input"
                placeholder="Contoh: Senin–Jumat, 08.00–17.00"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="res-notes" className="label">Catatan</label>
              <textarea
                id="res-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Membuat...' : 'Buat sumber daya'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {resources.length === 0 ? (
        <div className="card p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="mt-3 text-sm text-gray-500">Belum ada sumber daya.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r) => (
            <Link key={r.id} to={`/sumber-daya/${r.id}`} className="card p-5 hover:border-primary-300 transition">
              <h3 className="font-semibold text-gray-900">{r.name}</h3>
              {r.role && <p className="mt-1 text-xs text-gray-500">{r.role}</p>}
              {r.email && <p className="mt-2 text-sm text-gray-600 truncate">{r.email}</p>}
              <p className="mt-3 text-xs text-primary-700 font-medium">Lihat detail →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
