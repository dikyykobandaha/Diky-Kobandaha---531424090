import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import FormError from '../components/FormError';
import { useToast } from '../hooks/useToast';

interface Invitation {
  id: string;
  code: string;
  role: string;
  invitedEmail?: string | null;
  expiresAt?: string | null;
  usedAt?: string | null;
  createdAt: string;
}

export default function InvitePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { addToast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState('member');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const res = await api.get(`/invitations?organizationId=${orgId}`);
        setInvitations((res.data as { data?: Invitation[] }).data ?? []);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  async function handleCreate() {
    if (!email.trim()) {
      setError('Email penerima undangan wajib diisi.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await api.post('/invitations', {
        organizationId: orgId,
        role,
        email: email.trim().toLowerCase(),
      });
      const created = (res.data as { data?: Invitation }).data;
      if (created) setInvitations((prev) => [created, ...prev]);
      setEmail('');
      addToast('Kode undangan dibuat.', 'success');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Hapus kode undangan ini?')) return;
    try {
      await api.delete(`/invitations/${id}`);
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      addToast('Kode undangan dihapus.', 'success');
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(() => addToast('Kode disalin.', 'success'));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Undangan Anggota</h1>
      <p className="mb-4 text-sm text-gray-500">
        Bagikan kode undangan di bawah agar anggota baru bisa bergabung ke organisasi.
      </p>

      {error && <FormError error={error} />}

      <div className="mb-6 card p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Buat kode undangan</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="invite-email" className="label">Email penerima</label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-auto"
              placeholder="nama@contoh.com"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="label">Peran anggota baru</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input w-auto"
            >
              <option value="member">Anggota</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button onClick={handleCreate} disabled={creating} className="btn-primary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {creating ? 'Membuat...' : 'Buat kode'}
            </span>
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Memuat undangan...</p>
      ) : invitations.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500">Belum ada kode undangan aktif.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-gray-900">{inv.code}</p>
                <p className="text-xs text-gray-500">
                  Peran: {inv.role === 'admin' ? 'Admin' : 'Anggota'}
                  {inv.invitedEmail && ` · ${inv.invitedEmail}`}
                  {inv.usedAt && ' · Telah dipakai'}
                  {inv.expiresAt && ` · Kedaluwarsa ${new Date(inv.expiresAt).toLocaleDateString('id-ID')}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => copyCode(inv.code)} className="btn-ghost text-sm">
                  Salin
                </button>
                <button
                  onClick={() => handleDelete(inv.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
