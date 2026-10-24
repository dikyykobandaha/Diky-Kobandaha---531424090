import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { api, formatApiError } from '../lib/api';
import { formatDateShort } from '../lib/formatters';
import { TaskStatusBadge, PriorityBadge } from '../components/Badges';
import FormError from '../components/FormError';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import type { TaskWithSchedule, TaskFilter, Event } from '../types/api';
import type { TaskStatus, TaskPriority } from '../types/api';

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { addToast } = useToast();

  const orgId = user?.organizationId ?? '';
  const eventId = searchParams.get('eventId') ?? '';
  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<TaskWithSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [sort, setSort] = useState('default');
  const [filterLoading, setFilterLoading] = useState(false);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    startDate: '',
    durationDays: 1,
    priority: 'medium' as TaskPriority,
    status: 'not_started' as TaskStatus,
    progress: 0,
    isMilestone: false,
    assigneeId: '',
    estimatedCost: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newTaskEventId, setNewTaskEventId] = useState('');

  const [assignees, setAssignees] = useState<{ id: string; name: string; email: string }[]>([]);

  // Muat daftar acara (untuk filter & form tugas baru) serta daftar anggota.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/events');
        if (!cancelled) setEvents((res.data as { data?: Event[] }).data ?? []);
      } catch {
        if (!cancelled) setEvents([]);
      }
      try {
        const res = await api.get(`/members?organizationId=${orgId}`);
        const allMembers = (res.data as { data?: { id: string; name: string; email: string }[] }).data ?? [];
        if (!cancelled) setAssignees(allMembers);
      } catch {
        if (!cancelled) setAssignees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const loadTasks = useCallback(async (filters?: Partial<TaskFilter>) => {
    if (!eventId && !orgId) {
      setLoading(false);
      return;
    }
    setFilterLoading(true);
    try {
      const params = new URLSearchParams();
      if (eventId) {
        params.set('eventId', eventId);
      } else {
        params.set('organizationId', orgId);
      }
      if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters?.priority && filters.priority !== 'all') params.set('priority', filters.priority);
      if (filters?.assigneeId) params.set('assigneeId', filters.assigneeId);
      if (search) params.set('search', search);
      if (sort !== 'default') params.set('sort', sort);
      const res = await api.get(`/tasks?${params}`);
      setTasks((res.data as { data?: TaskWithSchedule[] }).data ?? []);
      setError(null);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  }, [eventId, orgId, search, sort]);

  useEffect(() => {
    loadTasks({ status: statusFilter, priority: priorityFilter, assigneeId: assigneeFilter ?? undefined });
  }, [loadTasks, statusFilter, priorityFilter, assigneeFilter]);

  async function handleCreate() {
    if (!newTask.title.trim()) {
      setCreateError('Judul tugas wajib diisi.');
      return;
    }
    const targetEventId = newTaskEventId || eventId || events[0]?.id || '';
    if (!targetEventId) {
      setCreateError('Pilih acara terlebih dahulu sebelum membuat tugas.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post('/tasks', {
        ...newTask,
        eventId: targetEventId,
        // Form menyimpan biaya sebagai string; kirim null bila kosong.
        estimatedCost:
          newTask.estimatedCost === '' ? null : Number(newTask.estimatedCost),
        assigneeIds: newTask.assigneeId ? [newTask.assigneeId] : [],
      });
      const created = (res.data as { data?: TaskWithSchedule }).data;
      setTasks((prev) => (created ? [created, ...prev] : prev));
      setShowNewForm(false);
      setNewTask({
        title: '',
        description: '',
        startDate: '',
        durationDays: 1,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeId: '',
        estimatedCost: '',
      });
      addToast('Tugas berhasil dibuat.', 'success');
    } catch (err: any) {
      setCreateError(err?.response?.data?.message ?? 'Gagal membuat tugas.');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat tugas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tugas</h1>
        {(eventId || events.length > 0) && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setShowNewForm((v) => !v);
              setNewTaskEventId(eventId || events[0]?.id || '');
            }}
          >
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Tugas baru
            </span>
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Filters */}
      <div className="mb-4 card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={eventId}
            onChange={(e) =>
              setSearchParams((prev) => {
                if (e.target.value) prev.set('eventId', e.target.value);
                else prev.delete('eventId');
                return prev;
              })
            }
            className="input w-auto"
            aria-label="Filter acara"
          >
            <option value="">Semua acara</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Cari tugas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="input w-auto"
          >
            <option value="all">Semua status</option>
            <option value="not_started">Belum dimulai</option>
            <option value="in_progress">Sedang dikerjakan</option>
            <option value="delayed">Tertunda</option>
            <option value="done">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="input w-auto"
          >
            <option value="all">Semua prioritas</option>
            <option value="low">Rendah</option>
            <option value="medium">Sedang</option>
            <option value="high">Tinggi</option>
            <option value="urgent">Mendesak</option>
          </select>
          <select
            value={assigneeFilter ?? ''}
            onChange={(e) => setAssigneeFilter(e.target.value || null)}
            className="input w-auto"
          >
            <option value="">Semua anggota</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="input w-auto"
          >
            <option value="default">Urutan default</option>
            <option value="startDate-asc">Tanggal mulai (terawal)</option>
            <option value="startDate-desc">Tanggal mulai (terakhir)</option>
            <option value="priority-desc">Prioritas (tertinggi)</option>
            <option value="progress-asc">Progres (rendah)</option>
            <option value="progress-desc">Progres (tinggi)</option>
          </select>
          {filterLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
              Mem filter...
            </div>
          )}
        </div>
      </div>

      {/* New task form */}
      {showNewForm && (
        <div className="mb-4 card p-5">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Buat tugas baru</h3>
          <FormError error={createError} />
          <form
            onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <label htmlFor="new-eventId" className="label">Acara</label>
              <select
                id="new-eventId"
                required
                value={newTaskEventId || eventId || events[0]?.id || ''}
                onChange={(e) => setNewTaskEventId(e.target.value)}
                className="input"
              >
                {events.length === 0 && <option value="">Tidak ada acara</option>}
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="new-title" className="label">Judul</label>
              <input
                id="new-title"
                type="text"
                required
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                className="input"
                placeholder="Masukkan judul tugas"
              />
            </div>
            <div>
              <label htmlFor="new-startDate" className="label">Tanggal mulai</label>
              <input
                id="new-startDate"
                type="date"
                required
                value={newTask.startDate}
                onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="new-durationDays" className="label">Durasi (hari kerja)</label>
              <input
                id="new-durationDays"
                type="number"
                min="0"
                required
                value={newTask.durationDays}
                onChange={(e) => setNewTask({ ...newTask, durationDays: parseInt(e.target.value) || 1 })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="new-priority" className="label">Prioritas</label>
              <select
                id="new-priority"
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
                className="input"
              >
                <option value="low">Rendah</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
                <option value="urgent">Mendesak</option>
              </select>
            </div>
            <div>
              <label htmlFor="new-assigneeId" className="label">Penanggung jawab</label>
              <select
                id="new-assigneeId"
                value={newTask.assigneeId}
                onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value })}
                className="input"
              >
                <option value="">Pilih anggota</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-progress" className="label">Progress (%)</label>
              <input
                id="new-progress"
                type="number"
                min="0"
                max="100"
                required
                value={newTask.progress}
                onChange={(e) => setNewTask({ ...newTask, progress: parseInt(e.target.value) || 0 })}
                className="input"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newTask.isMilestone}
                  onChange={(e) => setNewTask({ ...newTask, isMilestone: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Milestone
              </label>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Membuat...' : 'Buat tugas'}
              </button>
              <button type="button" onClick={() => setShowNewForm(false)} className="btn-secondary">
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tasks table */}
      {tasks.length === 0 ? (
        <div className="card p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <p className="mt-3 text-sm text-gray-500">Belum ada tugas.</p>
          <p className="mt-1 text-xs text-gray-400">Buat tugas baru untuk mulai mengelola proyek.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header px-4 py-3">Tugas</th>
                  <th className="table-header px-4 py-3">Tanggal mulai</th>
                  <th className="table-header px-4 py-3">Durasi</th>
                  <th className="table-header px-4 py-3">Prioritas</th>
                  <th className="table-header px-4 py-3">Status</th>
                  <th className="table-header px-4 py-3">Progress</th>
                  <th className="table-header px-4 py-3">Penanggung jawab</th>
                  <th className="table-header px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        {task.isMilestone && (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                            M
                          </span>
                        )}
                        <Link
                          to={`/tugas/${task.id}`}
                          className="font-medium text-primary-700 hover:text-primary-800"
                        >
                          {task.title}
                        </Link>
                      </div>
                    </td>
                    <td className="table-cell text-gray-600">
                      {task.startDate ? formatDateShort(task.startDate) : '-'}
                    </td>
                    <td className="table-cell text-gray-600">
                      {task.durationDays} hari kerja
                    </td>
                    <td className="table-cell">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="table-cell">
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={clsx(
                              'h-full rounded-full',
                              task.status === 'done' ? 'bg-emerald-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-amber-400'
                            )}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{task.progress}%</span>
                      </div>
                    </td>
                    <td className="table-cell text-gray-600">
                      {task.assignee?.name ??
                        (task.assigneeIds?.[0]
                          ? assignees.find((a) => a.id === task.assigneeIds?.[0])?.name ?? 'Anggota'
                          : '-')}
                    </td>
                    <td className="table-cell text-right">
                      <Link
                        to={`/tugas/${task.id}`}
                        className="btn-ghost text-xs py-1 px-2"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
