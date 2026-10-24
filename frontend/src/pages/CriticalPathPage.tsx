import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import { useResolvedEventId } from '../hooks/useResolvedEventId';

interface CpmTaskNode {
  id: string;
  title: string;
  durationWorkDays: number;
  isMilestone: boolean;
  earliestStartWorkDay: number | null;
  earliestFinishWorkDay: number | null;
  latestStartWorkDay: number | null;
  latestFinishWorkDay: number | null;
  floatWorkDays: number | null;
  isCritical: boolean;
}

interface CpmScheduleEntry {
  taskId: string;
  earliestStart: string | null;
  earliestFinish: string | null;
  latestStart: string | null;
  latestFinish: string | null;
}

interface CpmPayload {
  event?: { id: string; name: string } | null;
  cpm: {
    projectDurationWorkDays: number | null;
    criticalTaskIds: string[];
    criticalPaths: string[][];
    errors: string[];
    tasks: CpmTaskNode[];
  } | null;
  computedSchedule?: CpmScheduleEntry[];
  isEmpty?: boolean;
  message?: string;
}

export default function CriticalPathPage() {
  const params = useParams<{ eventId: string }>();
  const resolved = useResolvedEventId(params.eventId);
  const eventId = resolved.eventId;
  const [data, setData] = useState<CpmPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get(`/cpm/${eventId}`);
        setData((res.data as { data?: CpmPayload }).data ?? null);
        setError(null);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  if (resolved.loading || (!eventId && !resolved.error)) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Menghitung jalur kritis...</p>
        </div>
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="card p-6 text-center">
        <p className="text-gray-600">{resolved.error ?? 'Acara tidak ditemukan.'}</p>
        <Link to="/acara" className="btn-secondary mt-4">Kembali ke daftar acara</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Menghitung jalur kritis...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-600">{error ?? 'Gagal menghitung jalur kritis.'}</p>
        <Link to="/acara" className="btn-secondary mt-4">Kembali ke daftar acara</Link>
      </div>
    );
  }

  if (!data.cpm) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader eventId={eventId} eventName={data.event?.name} />
        <div className="card p-6 text-center text-sm text-gray-500">
          {data.message ?? 'Belum ada tugas. Buat tugas dan dependensi untuk menghitung jalur kritis.'}
        </div>
      </div>
    );
  }

  const cpm = data.cpm;
  const tasks = cpm.tasks ?? [];
  const scheduleById = new Map((data.computedSchedule ?? []).map((s) => [s.taskId, s]));
  const criticalTasks = tasks.filter((t) => t.isCritical);
  const criticalSet = new Set(cpm.criticalTaskIds ?? []);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eventId={eventId} eventName={data.event?.name} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Durasi proyek</p>
          <p className="mt-1 text-3xl font-bold text-primary-700">
            {cpm.projectDurationWorkDays ?? '-'}{' '}
            <span className="text-base text-gray-500">hari kerja</span>
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Tugas kritis</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{criticalTasks.length}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total tugas</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{tasks.length}</p>
        </div>
      </div>

      {cpm.errors && cpm.errors.length > 0 && (
        <div className="mb-4 card p-4 text-sm text-amber-700">
          <p className="font-medium mb-1">Catatan perhitungan:</p>
          <ul className="list-disc pl-4">
            {cpm.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Urutan tugas kritis</h2>
        {criticalTasks.length === 0 ? (
          <p className="text-sm text-gray-400">
            Jalur kritis belum dapat ditentukan. Pastikan tugas saling terhubung dengan dependensi.
          </p>
        ) : (
          <div className="space-y-2">
            {criticalTasks.map((task, index) => {
              const schedule = scheduleById.get(task.id);
              return (
                <Link
                  key={task.id}
                  to={`/tugas/${task.id}`}
                  className="flex items-center justify-between border border-red-200 bg-red-50 rounded-lg px-3 py-2 hover:bg-red-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-red-500">#{index + 1}</span>
                    <span className="min-w-0 truncate text-sm font-medium text-red-800">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>ES: {schedule?.earliestStart ?? '-'}</span>
                    <span>EF: {schedule?.earliestFinish ?? '-'}</span>
                    <span>Float: {task.floatWorkDays ?? 0} hari</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="mt-6 card p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Semua tugas dalam proyek</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header px-4 py-3">Tugas</th>
                  <th className="table-header px-4 py-3">Durasi (hari kerja)</th>
                  <th className="table-header px-4 py-3">Mulai paling awal</th>
                  <th className="table-header px-4 py-3">Selesai paling awal</th>
                  <th className="table-header px-4 py-3">Float</th>
                  <th className="table-header px-4 py-3">Kritis</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const schedule = scheduleById.get(t.id);
                  return (
                    <tr key={t.id} className={`table-row ${t.isCritical ? 'bg-red-50/50' : ''}`}>
                      <td className="table-cell font-medium">
                        <Link to={`/tugas/${t.id}`} className="text-primary-700 hover:text-primary-800">
                          {t.title}
                        </Link>
                        {t.isMilestone && (
                          <span className="ml-2 badge bg-amber-100 text-amber-700">Milestone</span>
                        )}
                      </td>
                      <td className="table-cell text-gray-600">{t.durationWorkDays}</td>
                      <td className="table-cell text-gray-600">{schedule?.earliestStart ?? '-'}</td>
                      <td className="table-cell text-gray-600">{schedule?.earliestFinish ?? '-'}</td>
                      <td className="table-cell text-gray-600">{t.floatWorkDays ?? '-'}</td>
                      <td className="table-cell">
                        {criticalSet.has(t.id) ? (
                          <span className="badge bg-red-100 text-red-700">Kritis</span>
                        ) : (
                          <span className="text-xs text-gray-400">Tidak</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Perubahan pada tugas kritis akan langsung memengaruhi durasi proyek.
      </p>
    </div>
  );
}

function PageHeader({ eventId, eventName }: { eventId: string; eventName?: string | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Jalur Kritis (CPM)</h1>
        {eventName && <p className="mt-1 text-sm text-gray-500">{eventName}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Link to={`/acara/${eventId}`} className="btn-secondary">Detail acara</Link>
        <Link to={`/gantt/${eventId}`} className="btn-secondary">Gantt</Link>
        <Link to={`/pert/${eventId}`} className="btn-secondary">PERT</Link>
      </div>
    </div>
  );
}
