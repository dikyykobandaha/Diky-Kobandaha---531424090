import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import { useResolvedEventId } from '../hooks/useResolvedEventId';
import PertDiagram from '../components/PertDiagram';
import type { DependencyType, TaskPriority, TaskStatus } from '../types/api';

interface PertNode {
  id: string;
  title: string;
  duration: number;
  isMilestone: boolean;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  es?: number | null;
  ef?: number | null;
  ls?: number | null;
  lf?: number | null;
  float?: number | null;
  isCritical: boolean;
  assignee?: { id: string; name: string } | null;
}

interface PertEdge {
  id: string;
  from: string;
  to: string;
  type: DependencyType;
  lagWorkDays: number;
  fromTitle: string;
  toTitle: string;
}

interface PertPayload {
  nodes: PertNode[];
  edges: PertEdge[];
  cpm?: {
    projectDurationDays: number | null;
    criticalTaskIds: string[];
    criticalPaths: string[][];
  };
  topologicalOrder?: string[];
  event?: { id: string; name: string } | null;
}

export default function PertPage() {
  const params = useParams<{ eventId: string }>();
  const resolved = useResolvedEventId(params.eventId);
  const eventId = resolved.eventId;
  const [data, setData] = useState<PertPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get(`/pert/${eventId}`);
        setData((res.data as { data?: PertPayload }).data ?? null);
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
          <p className="mt-3 text-sm text-gray-600">Memuat jaringan PERT...</p>
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
          <p className="mt-3 text-sm text-gray-600">Memuat jaringan PERT...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-600">{error ?? 'Gagal memuat PERT.'}</p>
        <Link to="/acara" className="btn-secondary mt-4">Kembali ke daftar acara</Link>
      </div>
    );
  }

  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Diagram PERT</h1>
          {data.event?.name && <p className="mt-1 text-sm text-gray-500">{data.event.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/acara/${eventId}`} className="btn-secondary">Detail acara</Link>
          <Link to={`/gantt/${eventId}`} className="btn-secondary">Gantt</Link>
          <Link to={`/jalur-kritis/${eventId}`} className="btn-secondary">Jalur kritis</Link>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500">Belum ada tugas untuk ditampilkan.</p>
          <Link to={`/tugas?eventId=${eventId}`} className="btn-primary mt-4">
            Tambah tugas
          </Link>
        </div>
      ) : (
        <>
          {data.cpm && data.cpm.projectDurationDays != null && (
            <div className="mb-4 card p-4 flex items-center gap-6 text-sm">
              <div>
                <span className="text-xs text-gray-500">Durasi proyek</span>
                <p className="text-lg font-bold text-gray-900">{data.cpm.projectDurationDays} hari kerja</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Tugas kritis</span>
                <p className="text-lg font-bold text-red-700">{data.cpm.criticalTaskIds?.length ?? 0}</p>
              </div>
            </div>
          )}

          <div className="card p-4">
            <PertDiagram
              nodes={nodes}
              edges={edges}
              cpm={
                data.cpm
                  ? {
                      projectDurationDays: data.cpm.projectDurationDays,
                      criticalTaskIds: data.cpm.criticalTaskIds ?? [],
                      criticalPaths: data.cpm.criticalPaths ?? [],
                    }
                  : undefined
              }
              topologicalOrder={data.topologicalOrder}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
            />
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Klik simpul untuk memilih, klik dua kali untuk membuka detail tugas.
          </p>
        </>
      )}
    </div>
  );
}
