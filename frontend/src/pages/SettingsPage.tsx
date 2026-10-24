import { useState } from 'react';
import { api, formatApiError } from '../lib/api';
import FormError from '../components/FormError';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const { addToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    setChanging(true);
    setError(null);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast('Kata sandi berhasil diganti.', 'success');
      await refreshUser();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setChanging(false);
    }
  }

  async function handleRefreshSession() {
    try {
      await refreshUser();
      addToast('Sesi diperbarui.', 'success');
    } catch {
      addToast('Gagal memperbarui sesi.', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Pengaturan</h1>
      <p className="mb-6 text-sm text-gray-500">Kelola akun dan keamanan Anda.</p>

      <div className="card p-5 mb-6">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Informasi akun</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs text-gray-500">Nama</dt>
            <dd className="font-medium text-gray-900">{user?.name ?? '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Email</dt>
            <dd className="font-medium text-gray-900">{user?.email ?? '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Organisasi</dt>
            <dd className="font-medium text-gray-900">{user?.organizationId ?? 'Belum tergabung'}</dd>
          </div>
        </dl>
        <div className="mt-4 flex gap-2">
          <button onClick={handleRefreshSession} className="btn-secondary text-sm">
            Perbarui sesi
          </button>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Ganti kata sandi</h2>
        <FormError error={error} />
        <form onSubmit={handleChangePassword} className="grid gap-4">
          <div>
            <label htmlFor="cur-pass" className="label">Kata sandi saat ini</label>
            <input
              id="cur-pass"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label htmlFor="new-pass" className="label">Kata sandi baru</label>
            <input
              id="new-pass"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="confirm-pass" className="label">Konfirmasi kata sandi baru</label>
            <input
              id="confirm-pass"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </div>
          <div>
            <button type="submit" disabled={changing} className="btn-primary">
              {changing ? 'Menyimpan...' : 'Ganti kata sandi'}
            </button>
          </div>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Keluar</h2>
        <p className="mb-3 text-sm text-gray-500">Akhiri sesi ini di perangkat saat ini.</p>
        <button onClick={() => logout()} className="btn-danger">
          Keluar
        </button>
      </div>
    </div>
  );
}
