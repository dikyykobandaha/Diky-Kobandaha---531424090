import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import FormError from '../components/FormError';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

interface OrgMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: { id: string; name: string; email: string } | null;
}

export default function MembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const res = await api.get(`/members?organizationId=${orgId}`);
        setMembers((res.data as { data?: OrgMember[] }).data ?? []);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  async function handleRoleChange(memberId: string, role: string) {
    setBusyId(memberId);
    try {
      await api.put(`/organizations/${orgId}/members/${memberId}`, { role });
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
      addToast('Peran anggota diperbarui.', 'success');
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(memberId: string) {
    if (!window.confirm('Hapus anggota ini dari organisasi?')) return;
    setBusyId(memberId);
    try {
      await api.delete(`/organizations/${orgId}/members/${memberId}`);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      addToast('Anggota dihapus.', 'success');
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat anggota...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Anggota Organisasi</h1>
        <Link to={`/organisasi/${orgId}/undangan`} className="btn-primary">
          Undang anggota
        </Link>
      </div>

      {error && <FormError error={error} />}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header px-4 py-3">Nama</th>
                <th className="table-header px-4 py-3">Email</th>
                <th className="table-header px-4 py-3">Peran</th>
                <th className="table-header px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="table-row">
                  <td className="table-cell">
                    <span className="font-medium">{m.user?.name ?? 'Anggota'}</span>
                    {m.userId === currentUser?.id && (
                      <span className="ml-2 text-xs text-gray-400">(Anda)</span>
                    )}
                  </td>
                  <td className="table-cell text-gray-600">{m.user?.email ?? '-'}</td>
                  <td className="table-cell">
                    <select
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="input w-auto py-1 text-xs"
                    >
                      <option value="owner">Pemilik</option>
                      <option value="admin">Admin</option>
                      <option value="member">Anggota</option>
                    </select>
                  </td>
                  <td className="table-cell text-right">
                    <button
                      onClick={() => handleRemove(m.id)}
                      disabled={busyId === m.id}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {members.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">Belum ada anggota terdaftar.</p>
      )}
    </div>
  );
}
