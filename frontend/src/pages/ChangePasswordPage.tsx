import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { formatApiError } from '../lib/api';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { changePassword } = useAuth();
  const { addToast } = useToast();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPw !== confirmPw) {
      setError('Kata sandi konfirmasi tidak cocok.');
      return;
    }
    if (newPw.length < 8) {
      setError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPw, newPw);
      addToast('Kata sandi berhasil diubah.', 'success');
      navigate('/profil');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Ganti kata sandi</h1>
      <p className="mb-6 text-sm text-gray-500">Masukkan kata sandi saat ini dan kata sandi baru.</p>

      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPw" className="label">Kata sandi saat ini</label>
            <input
              id="currentPw"
              type="password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="input"
              placeholder="Masukkan kata sandi saat ini"
            />
          </div>
          <div>
            <label htmlFor="newPw" className="label">Kata sandi baru</label>
            <input
              id="newPw"
              type="password"
              required
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="input"
              placeholder="Minimal 8 karakter"
            />
          </div>
          <div>
            <label htmlFor="confirmPw" className="label">Konfirmasi kata sandi baru</label>
            <input
              id="confirmPw"
              type="password"
              required
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="input"
              placeholder="Ulangi kata sandi baru"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Memproses...' : 'Simpan'}
            </button>
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
