import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import { formatDateShort } from '../lib/formatters';
import { TaskStatusBadge, PriorityBadge } from '../components/Badges';
import type { ResourceWithAssignments } from '../types/api';

export default function ResourceDetailPage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const [resource, setResource] = useState<ResourceWithAssignments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resourceId) return;
    (async () => {
      try {
        const res = await api.get(`/resources/${resourceId}`);
        setResource((res.data as { data?: ResourceWithAssignments }).data ?? null);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [resourceId]);

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat sumber daya...</p>
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-600">{error ?? 'Sumber daya tidak ditemukan.'}</p>
        <Link to="/sumber-daya" className="btn-secondary mt-4">Kembali</Link>
      </div>
    );
  }

  const taskLoad = resource.taskLoad ?? [];
  const assignments = resource.assignments ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{resource.name}</h1>
          {resource.role && <p className="mt-1 text-sm text-gray-500">{resource.role}</p>}
        </div>
        <Link to="/sumber-daya" className="btn-secondary">Kembali</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Informasi</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Email</dt>
              <dd className="text-gray-900">{resource.email ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Telepon</dt>
              <dd className="text-gray-900">{resource.phone ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Tarif</dt>
              <dd className="text-gray-900">
                {resource.rate != null ? `Rp ${Number(resource.rate).toLocaleString('id-ID')}` : '-'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Ketersediaan</dt>
              <dd className="text-gray-900">{resource.availability ?? '-'}</dd>
            </div>
            {resource.notes && (
              <div>
                <dt className="text-xs text-gray-500">Catatan</dt>
                <dd className="text-gray-900 whitespace-pre-wrap">{resource.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            Tugas yang ditugaskan ({taskLoad.length > 0 ? taskLoad.length : assignments.length})
          </h2>
          {taskLoad.length === 0 && assignments.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada penugasan tugas untuk sumber daya ini.</p>
          ) : taskLoad.length > 0 ? (
            <div className="space-y-2">
              {taskLoad.map((tl) => (
                <Link
                  key={tl.taskId}
                  to={`/tugas/${tl.taskId}`}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{tl.title}</span>
                    {tl.isMilestone && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                        M
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {tl.startDate && <span>{formatDateShort(tl.startDate)}</span>}
                    <TaskStatusBadge status={tl.status} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => (
                <Link
                  key={a.id}
                  to={`/tugas/${a.taskId}`}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {a.task?.title ?? a.taskId}
                  </span>
                  {a.task && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <PriorityBadge priority={a.task.priority} />
                      <TaskStatusBadge status={a.task.status} />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
