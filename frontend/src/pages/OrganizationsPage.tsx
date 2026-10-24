import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import FormError from '../components/FormError';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

interface OrgItem {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  role: string;
  joinedAt: string;
}

export default function OrganizationsPage() {
  const { refreshUser } = useAuth();
  const { addToast } = useToast();
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/organizations');
        setOrgs((res.data as { data?: OrgItem[] }).data ?? []);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCreate() {
    if (!form.name.trim()) {
      setCreateError('Nama organisasi wajib diisi.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post('/organizations', form);
      const created = (res.data as { data?: OrgItem }).data;
      if (created) setOrgs((prev) => [...prev, created]);
      setShowForm(false);
      setForm({ name: '', description: '' });
      await refreshUser();
      addToast('Organisasi berhasil dibuat.', 'success');
    } catch (err) {
      setCreateError(formatApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    const code = inviteCode.trim();
    if (!code) {
      setJoinMessage('Masukkan kode undangan terlebih dahulu.');
      return;
    }
    setJoining(true);
    setJoinMessage(null);
    try {
      await api.post(`/organizations/invitations/${encodeURIComponent(code)}/accept`, {});
      const res = await api.get('/organizations');
      setOrgs((res.data as { data?: OrgItem[] }).data ?? []);
      await refreshUser();
      setInviteCode('');
      addToast('Berhasil bergabung ke organisasi.', 'success');
    } catch (err) {
      setJoinMessage(formatApiError(err));
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat organisasi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Organisasi</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <span className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Organisasi baru
          </span>
        </button>
      </div>

      {error && <div className="mb-4 card p-4 text-sm text-red-600">{error}</div>}

      <div className="mb-6 card p-5">
        <h3 className="mb-3 text-base font-semibold text-gray-900">Gabung dengan kode undangan</h3>
        {joinMessage && (
          <p className="mb-3 text-sm text-red-600">{joinMessage}</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="invite-code" className="label">Kode undangan</label>
            <input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="input w-auto font-mono"
              placeholder="INV-XXXXXXXX"
            />
          </div>
          <button type="button" onClick={handleJoin} disabled={joining} className="btn-secondary">
            {joining ? 'Memproses...' : 'Gabung'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 card p-5">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Buat organisasi</h3>
          <FormError error={createError} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="grid gap-4"
          >
            <div>
              <label htmlFor="org-name" className="label">Nama organisasi <span className="text-red-500">*</span></label>
              <input
                id="org-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="org-description" className="label">Deskripsi</label>
              <textarea
                id="org-description"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input"
              />
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Membuat...' : 'Buat organisasi'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {orgs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500">Anda belum tergabung dalam organisasi. Buat organisasi baru untuk memulai.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <Link key={org.id} to={`/organisasi/${org.id}`} className="card p-5 hover:border-primary-300 transition">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{org.name}</h3>
                <span className="badge badge-primary text-xs capitalize">{org.role}</span>
              </div>
              {org.description && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{org.description}</p>}
              {org.code && (
                <p className="mt-2 text-xs text-gray-400">Kode: <span className="font-mono">{org.code}</span></p>
              )}
              <p className="mt-3 text-xs text-primary-700 font-medium">Lihat detail →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
