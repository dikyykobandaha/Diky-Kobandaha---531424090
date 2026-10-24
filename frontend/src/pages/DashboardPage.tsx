import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import { formatDateLong } from '../lib/formatters';
import { useAuth } from '../hooks/useAuth';

interface SummaryData {
  organizationId: string;
  eventCount: number;
  upcomingEventCount: number;
  runningEventCount: number;
  taskCount: number;
  notStartedTaskCount: number;
  inProgressTaskCount: number;
  doneTaskCount: number;
  delayedTaskCount: number;
  cancelledTaskCount: number;
  overallProgress: number;
  upcomingMilestones: { id: string; title: string; eventId: string; eventName?: string; dueDate: string }[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.organizationId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await api.get('/analytics/summary');
        setSummary((res.data as { data?: SummaryData }).data ?? null);
      } catch (err) {
        setError(formatApiError(err) || 'Gagal memuat ringkasan.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.organizationId]);

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user?.organizationId) {
    return (
      <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Selamat datang, {user?.name?.split(' ')[0] ?? 'Pengguna'} 👋</h1>
        <p className="mt-2 text-sm text-gray-600">
          Anda belum tergabung dalam organisasi. Buat organisasi terlebih dahulu untuk mulai mengelola
          acara, tugas, dan jadwal proyek.
        </p>
        <Link to="/organisasi" className="btn-primary mt-5">Buat organisasi</Link>
      </div>
    );
  }

  if (error && !summary) {
    return <div className="card p-4 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">
        Selamat datang, {user?.name?.split(' ')[0] ?? 'Pengguna'} 👋
      </h1>
      <p className="mb-6 text-sm text-gray-500">Ringkasan aktivitas organisasi Anda.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total acara</p>
          <p className="mt-1 text-3xl font-bold text-primary-700">{summary?.eventCount ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total tugas</p>
          <p className="mt-1 text-3xl font-bold text-blue-700">{summary?.taskCount ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Tugas selesai</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">{summary?.doneTaskCount ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Progres keseluruhan</p>
          <p className="mt-1 text-3xl font-bold text-purple-700">{summary?.overallProgress ?? 0}%</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Milestone mendatang</h2>
            <Link to="/analitik" className="text-sm text-primary-700 hover:text-primary-800">
              Lihat semua
            </Link>
          </div>
          {summary && summary.upcomingMilestones.length > 0 ? (
            <div className="space-y-2">
              {summary.upcomingMilestones.map((m) => (
                <Link
                  key={m.id}
                  to={`/tugas/${m.id}`}
                  className="flex items-center justify-between border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 hover:bg-amber-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                      M
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium text-amber-800">{m.title}</span>
                  </div>
                  <span className="text-xs text-gray-500">{m.dueDate ? formatDateLong(m.dueDate) : '-'}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Belum ada milestone mendatang.</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900">Aksi cepat</h2>
          <div className="mt-4 space-y-2">
            <Link to="/acara" className="btn-secondary w-full justify-start">Kelola acara</Link>
            <Link to="/tugas" className="btn-secondary w-full justify-start">Kelola tugas</Link>
            <Link to="/gantt" className="btn-secondary w-full justify-start">Gantt chart</Link>
            <Link to="/analitik" className="btn-secondary w-full justify-start">Analitik</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
