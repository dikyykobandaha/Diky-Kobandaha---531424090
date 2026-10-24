import { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { api, formatApiError } from '../lib/api';
import { Link, useSearchParams } from 'react-router-dom';
import { EventSelector } from '../components/EventSelector';
import { formatDateLong, formatDateShort } from '../lib/formatters';
import { PriorityBadge } from '../components/Badges';
import { useToast } from '../hooks/useToast';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { AnalyticsData } from '../types/api';
import type { TaskStatus, TaskPriority } from '../types/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

type ChartDataType = 'status' | 'priority' | 'assignee';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useToast();

  const eventId = searchParams.get('eventId') ?? '';
  const orgId = user?.organizationId ?? '';
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chartType, setChartType] = useState<ChartDataType>('status');

  useEffect(() => {
    if (!eventId && !orgId) {
      setLoading(false);
      return;
    }
    const query = eventId
      ? `eventId=${encodeURIComponent(eventId)}`
      : `organizationId=${encodeURIComponent(orgId)}`;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/analytics?${query}`);
        setData((res.data as { data?: AnalyticsData }).data ?? null);
        setError(null);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [eventId, orgId]);

  const exportCsv = async () => {
    const query = eventId
      ? `eventId=${encodeURIComponent(eventId)}`
      : `organizationId=${encodeURIComponent(orgId)}`;
    if (!eventId && !orgId) return;
    try {
      const res = await api.get(`/analytics/csv?${query}`, { responseType: 'blob' });
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eventflow_analytics_${eventId || 'organisasi'}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      addToast('Laporan CSV berhasil diunduh.', 'success');
    } catch {
      addToast('Gagal mengunduh CSV.', 'error');
    }
  };

  const statusColors: Record<TaskStatus, string> = {
    not_started: '#9ca3af',
    in_progress: '#3b82f6',
    delayed: '#f59e0b',
    done: '#10b981',
    cancelled: '#6b7280',
  };

  const priorityColors: Record<TaskPriority, string> = {
    low: '#6b7280',
    medium: '#3b82f6',
    high: '#2563eb',
    urgent: '#dc2626',
  };

  const chartData = useMemo(() => {
    if (!data) return { labels: [], datasets: [] };
    if (chartType === 'status') {
      const labels = Object.keys(data.taskDistribution.status);
      const values = Object.values(data.taskDistribution.status);
      return {
        labels,
        datasets: [
          {
            label: 'Jumlah tugas',
            data: values,
            backgroundColor: labels.map((s) => statusColors[s as TaskStatus] ?? '#9ca3af'),
            borderWidth: 0,
          },
        ],
      };
    }
    if (chartType === 'priority') {
      const labels = Object.keys(data.taskDistribution.priority);
      const values = Object.values(data.taskDistribution.priority);
      return {
        labels,
        datasets: [
          {
            label: 'Jumlah tugas',
            data: values,
            backgroundColor: labels.map((p) => priorityColors[p as TaskPriority] ?? '#6b7280'),
            borderWidth: 0,
          },
        ],
      };
    }
    if (chartType === 'assignee') {
      const assigneeData = data.assigneeWorkload.slice(0, 10);
      return {
        labels: assigneeData.map((a) => a.name),
        datasets: [
          {
            label: 'Tugas aktif',
            data: assigneeData.map((a) => a.activeTaskCount),
            backgroundColor: '#3b82f6',
            borderWidth: 0,
          },
        ],
      };
    }
    return { labels: [], datasets: [] };
  }, [data, chartType]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: chartType === 'status' ? 'Tugas berdasarkan status' : chartType === 'priority' ? 'Tugas berdasarkan prioritas' : 'Tugas aktif per anggota',
        color: '#4B5563',
        font: { size: 13 },
      },
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
      x: { grid: { display: false } },
    },
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat analitik...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analitik</h1>
        {(eventId || orgId) && (
          <button onClick={exportCsv} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.93a2 2 0 011.664.893l5.714 2.286a1.125 1.125 0 01.41 1.411l-2.287 2.287a1.125 1.125 0 01-1.41 0l-5.714-2.286A2 2 0 017 14.714V17h5.93a2 2 0 01.893 1.664l2.287 5.714a1.125 1.125 0 010 .411l-2.287 2.287a1.125 1.125 0 01-1.41-.411l-2.286-2.287A2 2 0 0114 12.286V10H7V7a2 2 0 012-2h5.93a2 2 0 011.664.893l5.714 2.286a1.125 1.125 0 01.41 1.411l2.286 5.714a1.125 1.125 0 010 .411l2.287 2.287a1.125 1.125 0 01.411-.41l2.287-2.287a1.125 1.125 0 01.893-1.664V7a2 2 0 012-2z" />
              </svg>
              Ekspor CSV
            </span>
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Event selector */}
      {user?.organizationId && eventId !== user.organizationId && (
        <div className="mb-4">
          <EventSelector eventId={eventId} onChange={(id) => setSearchParams((prev) => { prev.set('eventId', id); return prev; })} />
        </div>
      )}

      {!data ? (
        <div className="card p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.02 2.273 5.48 1.3 1.34 2.884 2.458 4.592 3.168 2.09-.934 3.87-2.33 5.28-4.075 3.01-3.273 4.93-6.998 4.93-11.06 0-4.065-3.035-7.28-6.93-7.28S3 0.69 3 4.755c0 2.582 1.93 4.907 4.592 6.115 1.3 1.15 2.885 2.09 4.592 2.78 1.707-.69 3.287-1.638 4.592-2.575C13.15 14.755 15.845 16.02 18.615 16.598c1.406.325 2.658.68 3.676 1.178" />
          </svg>
          <p className="mt-3 text-sm text-gray-500">Belum ada data untuk dianalisis.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Ringkasan */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total tugas" value={data.summary.totalTasks} color="blue" />
            <StatCard label="Tugas selesai" value={data.summary.doneTasks} color="emerald" />
            <StatCard label="Tugas terlambat" value={data.summary.delayedTasks} color="amber" />
            <StatCard label="Progres rata-rata" value={`${data.summary.averageProgress}%`} color="purple" />
          </div>

          {/* Project progress */}
          <div className="card p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Progres proyek</h2>
            <div className="flex items-center gap-4">
              <div className="relative flex flex-1 flex-col items-center justify-center">
                <div className="h-24 w-24 -rotate-90 overflow-hidden rounded-full border-4 border-gray-200">
                  <div
                    className="h-full w-full overflow-hidden rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                    style={{ width: `${data.projectProgress}%` }}
                  />
                </div>
                <span className="mt-3 text-2xl font-bold text-gray-900">{data.projectProgress}%</span>
              </div>
              <div className="flex flex-1 flex-wrap justify-end gap-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span>Tugas belum dimulai: {data.summary.notStartedTasks}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-indigo-500" />
                  <span>Tugas sedang dikerjakan: {data.summary.inProgressTasks}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span>Tugas selesai: {data.summary.doneTasks}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span>Tugas terlambat: {data.summary.delayedTasks}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span>Tugas dibatalkan: {data.summary.cancelledTasks}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Distribusi tugas</h2>
              <div className="flex items-center gap-2">
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as ChartDataType)}
                  className="input w-auto text-sm"
                >
                  <option value="status">Status</option>
                  <option value="priority">Prioritas</option>
                  <option value="assignee">Anggota</option>
                </select>
              </div>
            </div>
            <div className="h-60">
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* Tugas terlambat & prioritas tinggi */}
          <div className="card p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Tugas yang perlu segera dikerjakan</h2>
            {(data.tasksNeedingAttention.length === 0) ? (
              <p className="text-sm text-gray-400">Tidak ada tugas yang memerlukan perhatian khusus.</p>
            ) : (
              <div className="space-y-2">
                {data.tasksNeedingAttention.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tugas/${task.id}`}
                    className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="min-w-0 truncate text-sm font-medium">{task.title}</span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {task.status === 'delayed' ? (
                        <span className="text-amber-600 font-medium">Tertunda</span>
                      ) : (
                        <span className="text-gray-500">{task.progress}%</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Beban kerja anggota */}
          <div className="card p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Beban kerja anggota</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header px-4 py-3">Anggota</th>
                    <th className="table-header px-4 py-3">Tugas aktif</th>
                    <th className="table-header px-4 py-3">Tugas selesai</th>
                    <th className="table-header px-4 py-3">Total tugas</th>
                    <th className="table-header px-4 py-3">Beban kerja</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assigneeWorkload.map((a) => (
                    <tr key={a.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 flex items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
                            {a.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm">{a.name}</span>
                        </div>
                      </td>
                      <td className="table-cell text-gray-600">{a.activeTaskCount}</td>
                      <td className="table-cell text-gray-600">{a.doneTaskCount}</td>
                      <td className="table-cell text-gray-600">{a.totalTaskCount}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={clsx(
                                'h-full rounded-full',
                                a.workloadPercent > 100 ? 'bg-red-500' : a.workloadPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                              )}
                              style={{ width: `${Math.min(a.workloadPercent, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{a.workloadPercent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Jalur kritis */}
          {data.criticalPath && data.criticalPath.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 text-base font-semibold text-gray-900">Jalur kritis</h2>
              <p className="mb-3 text-xs text-gray-500">Daftar tugas yang membentuk jalur kritis proyek. Perubahan pada tugas ini akan memengaruhi durasi proyek.</p>
              <div className="space-y-2">
                {data.criticalPath.map((task, index) => (
                  <Link
                    key={task.id}
                    to={`/tugas/${task.id}`}
                    className="flex items-center justify-between border border-red-200 bg-red-50 rounded-lg px-3 py-2 hover:bg-red-100"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-red-500 font-semibold">#{index + 1}</span>
                      <span className="min-w-0 truncate text-sm font-medium text-red-800">{task.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>ES: {task.earliestStart ? formatDateShort(task.earliestStart) : '-'}</span>
                      <span className="text-gray-300">|</span>
                      <span>EF: {task.earliestFinish ? formatDateShort(task.earliestFinish) : '-'}</span>
                      <span className="text-gray-300">|</span>
                      <span>Float: {task.totalFloat ?? 0}d</span>
                    </div>
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Total float nol menandakan tugas kritis.
              </p>
            </div>
          )}

          {/* Milestone */}
          {data.milestones.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 text-base font-semibold text-gray-900">Milestone</h2>
              <div className="space-y-2">
                {data.milestones.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tugas/${task.id}`}
                    className="flex items-center justify-between border border-amber-200 bg-amber-50 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold">M</span>
                      <span className="min-w-0 truncate text-sm font-medium text-amber-800">{task.title}</span>
                    </div>
                    <span className="text-xs text-gray-500">{task.startDate ? formatDateLong(task.startDate) : '-'}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className={`card p-4 ${colorMap[color] ?? 'bg-gray-50 text-gray-700'}`}>
      <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
