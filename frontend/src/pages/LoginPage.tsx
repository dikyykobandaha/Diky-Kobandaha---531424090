import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { formatApiError } from '../lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGeneralError(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      addToast('Selamat datang kembali, ' + (email.split('@')[0] ?? ''), 'success');
      navigate('/');
    } catch (err) {
      const msg = formatApiError(err);
      if (msg.toLowerCase().includes('tidak ditemukan') || msg.toLowerCase().includes('password')) {
        setError('Email atau kata sandi tidak tepat.');
      } else {
        setGeneralError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-primary-700">
            <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="currentColor" />
              <path d="M7 11h18M7 16h14M7 21h9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <circle cx="25" cy="21" r="3" fill="#fbbf24" />
            </svg>
            <span className="text-xl font-semibold">EventFlow</span>
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Selamat datang</h1>
          <p className="mt-1 text-sm text-gray-500">Masuk ke akun Anda untuk mulai mengelola acara.</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Alamat email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="nama@contoh.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="label">Kata sandi</label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Masukkan kata sandi"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {generalError && <p className="text-sm text-red-600">{generalError}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Memproses...
                </span>
              ) : 'Masuk'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Belum punya akun?{' '}
            <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700">
              Daftar di sini
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
