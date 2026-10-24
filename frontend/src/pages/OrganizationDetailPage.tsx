import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

interface OrgDetail {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  role?: string;
  createdAt?: string;
}

interface OrgMember {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string } | null;
}

export default function OrganizationDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const [orgRes, membersRes] = await Promise.all([
          api.get(`/organizations/${orgId}`),
          api.get(`/members?organizationId=${orgId}`),
        ]);
        setOrg((orgRes.data as { data?: OrgDetail }).data ?? null);
        setMembers((membersRes.data as { data?: OrgMember[] }).data ?? []);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  async function handleLeave() {
    if (!orgId || !window.confirm('Keluar dari organisasi ini?')) return;
    try {
      // Endpoint DELETE /organizations/:id/members/:memberId atau DELETE self
      const myMembership = members.find((m) => m.userId === user?.id);
      if (!myMembership) return;
      await api.delete(`/organizations/${orgId}/members/${myMembership.id}`);
      addToast('Anda telah keluar dari organisasi.', 'success');
      navigate('/organisasi');
    } catch (err) {
      addToast(formatApiError(err), 'error');
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

  if (error || !org) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-600">{error ?? 'Organisasi tidak ditemukan.'}</p>
        <Link to="/organisasi" className="btn-secondary mt-4">Kembali</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
          {org.description && <p className="mt-1 text-sm text-gray-500">{org.description}</p>}
          {org.code && (
            <p className="mt-1 text-xs text-gray-400">Kode: <span className="font-mono">{org.code}</span></p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/organisasi/${orgId}/anggota`} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Anggota
            </span>
          </Link>
          <Link to={`/organisasi/${orgId}/undangan`} className="btn-primary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Undangan
            </span>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Anggota ({members.length})</h2>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada anggota.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                  <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 text-sm font-semibold flex items-center justify-center">
                    {m.user?.name?.slice(0, 2).toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.user?.name ?? 'Anggota'}</p>
                    <p className="text-xs text-gray-500 truncate">{m.user?.email ?? '-'}</p>
                  </div>
                  <span className="badge badge-secondary text-xs capitalize">{m.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Aksi</h2>
          <div className="space-y-2">
            <Link to={`/acara?organizationId=${orgId}`} className="btn-secondary w-full justify-start">
              Lihat acara organisasi
            </Link>
            <button onClick={handleLeave} className="btn-danger w-full">
              Keluar dari organisasi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
