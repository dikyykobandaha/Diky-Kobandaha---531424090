import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import { useResolvedEventId } from '../hooks/useResolvedEventId';
import GanttChart from '../components/GanttChart';
import type {
  TaskWithSchedule,
  TaskDependency,
  Event,
  CpmTaskResult,
} from '../types/api';

interface GanttPayload {
  tasks: TaskWithSchedule[];
  dependencies: TaskDependency[];
  event?: Event | null;
  cpm?: { tasks: CpmTaskResult[]; criticalPathIds?: string[] } | null;
}

export default function GanttPage() {
  const params = useParams<{ eventId: string }>();
  const resolved = useResolvedEventId(params.eventId);
  const eventId = resolved.eventId;
  const [data, setData] = useState<GanttPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get(`/gantt/${eventId}`);
        setData((res.data as { data?: GanttPayload }).data ?? null);
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
          <p className="mt-3 text-sm text-gray-600">Memuat Gantt chart...</p>
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
          <p className="mt-3 text-sm text-gray-600">Memuat Gantt chart...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-600">{error ?? 'Gagal memuat Gantt chart.'}</p>
        <Link to="/acara" className="btn-secondary mt-4">Kembali ke daftar acara</Link>
      </div>
    );
  }

  const tasks = data.tasks ?? [];
  const dependencies = data.dependencies ?? [];
  const criticalSet = new Set(data.cpm?.criticalPathIds ?? []);
  const event = data.event;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gantt Chart</h1>
          {event?.name && <p className="mt-1 text-sm text-gray-500">{event.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/acara/${eventId}`} className="btn-secondary">Detail acara</Link>
          <Link to={`/pert/${eventId}`} className="btn-secondary">PERT</Link>
          <Link to={`/jalur-kritis/${eventId}`} className="btn-secondary">Jalur kritis</Link>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500">Belum ada tugas untuk ditampilkan.</p>
          <Link to={`/tugas?eventId=${eventId}`} className="btn-primary mt-4">
            Tambah tugas
          </Link>
        </div>
      ) : (
        <>
          <div className="card p-4">
            <GanttChart
              tasks={tasks}
              dependencies={dependencies}
              eventStart={event?.startDate}
              eventEnd={event?.endDate}
              selectedTaskId={selectedTaskId}
              onTaskSelect={setSelectedTaskId}
              height={Math.max(320, 120 + tasks.length * 34)}
            />
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Klik batang tugas untuk memilih; tugas berwarna biru tua adalah bagian jalur kritis
            ({criticalSet.size} tugas).
          </p>
        </>
      )}
    </div>
  );
}
