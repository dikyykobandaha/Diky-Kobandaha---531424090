import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setError(null);
    setLoading(true);
    try {
      await logout();
      addToast('Anda telah keluar.', 'success');
      navigate('/login');
    } catch {
      setError('Gagal keluar. Coba lagi.');
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Profil</h1>

      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-lg font-semibold">
            {user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="mt-1 text-xs text-gray-400">
              Anggota sejak{' '}
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Aksi profil</h2>
          <div className="space-y-3">
            <Link to="/profil?tab=password" className="btn-secondary w-full justify-start">
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Ganti kata sandi
              </span>
            </Link>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Keluar</h2>
          <p className="mb-3 text-sm text-gray-500">Keluar dari sesi saat ini di perangkat ini.</p>
          <button
            type="button"
            disabled={loading}
            onClick={handleLogout}
            className="btn-primary w-full"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Keluar...
              </span>
            ) : 'Keluar'}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
