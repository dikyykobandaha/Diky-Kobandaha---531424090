import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDateLong } from '../lib/formatters';
import { TaskStatusBadge, PriorityBadge } from '../components/Badges';
import { useToast } from '../hooks/useToast';
import GanttChart from '../components/GanttChart';
import PertDiagram from '../components/PertDiagram';
import { clsx } from 'clsx';
import type { TaskWithSchedule, TaskDependency, TaskUpdate } from '../types/api';

export default function TaskDetailPage() {
  // Route memakai parameter :taskId (lihat App.tsx).
  const { taskId: id } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [task, setTask] = useState<TaskWithSchedule | null>(null);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [edit, setEdit] = useState({
    title: '',
    description: '',
    startDate: '',
    durationDays: 1,
    priority: 'medium' as TaskWithSchedule['priority'],
    status: 'not_started' as TaskWithSchedule['status'],
    progress: 0,
    isMilestone: false,
    estimatedCost: null as number | null,
  });

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const [taskRes, depRes] = await Promise.all([
          api.get(`/tasks/${id}`),
          api.get(`/tasks/${id}/dependencies`),
        ]);
        const taskBody = taskRes.data as { data?: TaskWithSchedule };
        const depBody = depRes.data as { data?: TaskDependency[] };
        setTask(taskBody.data ?? null);
        setDependencies(depBody.data ?? []);
        if (taskBody.data) {
          const t = taskBody.data;
          setEdit({
            title: t.title,
            description: t.description ?? '',
            startDate: t.startDate ?? '',
            durationDays: t.durationDays ?? 1,
            priority: t.priority,
            status: t.status,
            progress: t.progress ?? 0,
            isMilestone: !!t.isMilestone,
            estimatedCost: (t.estimatedCost ?? null) as number | null,
          });
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? 'Gagal memuat detail tugas.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  async function handleUpdate(field: keyof typeof edit, value: any) {
    if (!id || !task) return;
    setUpdating(true);
    setUpdateError(null);
    const prevEdit = { ...edit };
    setEdit((prev) => ({ ...prev, [field]: value }));
    try {
      const updateData: TaskUpdate = { [field]: value };
      const res = await api.put(`/tasks/${id}`, updateData);
      const body = res.data as { data?: TaskWithSchedule };
      if (body.data) {
        setTask(body.data);
        const t = body.data;
        setEdit({
          title: t.title,
          description: t.description ?? '',
          startDate: t.startDate ?? '',
          durationDays: t.durationDays ?? 1,
          priority: t.priority,
          status: t.status,
          progress: t.progress ?? 0,
          isMilestone: !!t.isMilestone,
          estimatedCost: (t.estimatedCost ?? null) as number | null,
        });
      }
      addToast('Perubahan disimpan.', 'success');
    } catch (err: any) {
      setEdit(prevEdit);
      setUpdateError(err?.response?.data?.message ?? `Gagal memperbarui ${field}.`);
    } finally {
      setUpdating(false);
    }
  }

  async function handleAddDependency(predecessorId: string) {
    if (!id || !predecessorId) return;
    try {
      await api.post('/dependencies', { taskId: id, predecessorId, type: 'FS', lagWorkDays: 0 });
      const res = await api.get(`/tasks/${id}/dependencies`);
      const depBody = res.data as { data?: TaskDependency[] };
      setDependencies(depBody.data ?? []);
      addToast('Ketergantungan ditambahkan.', 'success');
    } catch (err: any) {
      setUpdateError(err?.response?.data?.message ?? 'Gagal menambahkan ketergantungan.');
    }
  }

  async function handleDeleteDependency(depId: string) {
    if (!id) return;
    try {
      await api.delete(`/dependencies/${depId}`);
      setDependencies((prev) => prev.filter((d) => d.id !== depId));
      addToast('Ketergantungan dihapus.', 'success');
    } catch (err: any) {
      setUpdateError(err?.response?.data?.message ?? 'Gagal menghapus ketergantungan.');
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm(`Hapus tugas "${task?.title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      await api.delete(`/tasks/${id}`);
      addToast('Tugas berhasil dihapus.', 'success');
      navigate('/tugas');
    } catch (err: any) {
      setUpdateError(err?.response?.data?.message ?? 'Gagal menghapus tugas.');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat detail tugas...</p>
        </div>
      </div>
    );
  }

  if (error && !task) {
    return <div className="card p-4 text-red-600 text-sm">{error}</div>;
  }

  if (!task) return null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {task.event?.name && (
              <>
                Acara:{' '}
                <Link to={`/acara/${task.event.id}`} className="text-primary-700 hover:text-primary-800">
                  {task.event.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/tugas" className="btn-secondary text-sm">
            Kembali
          </Link>
          <button onClick={handleDelete} className="btn-danger text-sm">
            Hapus
          </button>
        </div>
      </div>

      {updateError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{updateError}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: Info & Edit */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Informasi</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Status</dt>
                <dd><TaskStatusBadge status={task.status} /></dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Prioritas</dt>
                <dd><PriorityBadge priority={task.priority} /></dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Tanggal mulai</dt>
                <dd className="text-sm text-gray-700">{task.startDate ? formatDateLong(task.startDate) : '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Durasi</dt>
                <dd className="text-sm text-gray-700">{task.durationDays} hari kerja</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Progress</dt>
                <dd className="text-sm text-gray-700">
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200">
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
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Milestone</dt>
                <dd className="text-sm">{task.isMilestone ? 'Ya' : 'Tidak'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Penanggung jawab</dt>
                <dd className="text-sm text-gray-700">{task.assignee?.name ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Anggota yang ditugaskan</dt>
                <dd className="text-sm text-gray-700">
                  {task.taskMembers && task.taskMembers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {task.taskMembers.map((m) => (
                        <span key={m.id} className="badge badge-secondary text-xs">{m.user.name}</span>
                      ))}
                    </div>
                  ) : (
                    <span>Belum ada</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Estimasi biaya</dt>
                <dd className="text-sm text-gray-700">{task.estimatedCost ? `Rp ${Number(task.estimatedCost).toLocaleString('id-ID')}` : '-'}</dd>
              </div>
            </dl>
          </div>

          {task.description && (
            <div className="card p-4">
              <h2 className="mb-2 text-base font-semibold text-gray-900">Deskripsi</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          <div className="card p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Edit informasi</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-title" className="label">Judul</label>
                <input
                  id="edit-title"
                  type="text"
                  value={edit.title}
                  onChange={(e) => handleUpdate('title', e.target.value)}
                  disabled={updating}
                  className="input"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="edit-description" className="label">Deskripsi</label>
                <textarea
                  id="edit-description"
                  rows={3}
                  value={edit.description}
                  onChange={(e) => handleUpdate('description', e.target.value)}
                  disabled={updating}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="edit-startDate" className="label">Tanggal mulai</label>
                <input
                  id="edit-startDate"
                  type="date"
                  value={edit.startDate ? edit.startDate.slice(0, 10) : ''}
                  onChange={(e) => handleUpdate('startDate', e.target.value)}
                  disabled={updating}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="edit-durationDays" className="label">Durasi (hari kerja)</label>
                <input
                  id="edit-durationDays"
                  type="number"
                  min="0"
                  value={edit.durationDays}
                  onChange={(e) => handleUpdate('durationDays', parseInt(e.target.value) || 0)}
                  disabled={updating}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="edit-priority" className="label">Prioritas</label>
                <select
                  id="edit-priority"
                  value={edit.priority}
                  onChange={(e) => handleUpdate('priority', e.target.value)}
                  disabled={updating}
                  className="input"
                >
                  <option value="low">Rendah</option>
                  <option value="medium">Sedang</option>
                  <option value="high">Tinggi</option>
                  <option value="urgent">Mendesak</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-status" className="label">Status</label>
                <select
                  id="edit-status"
                  value={edit.status}
                  onChange={(e) => handleUpdate('status', e.target.value)}
                  disabled={updating}
                  className="input"
                >
                  <option value="not_started">Belum dimulai</option>
                  <option value="in_progress">Sedang dikerjakan</option>
                  <option value="delayed">Tertunda</option>
                  <option value="done">Selesai</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-progress" className="label">Progress (%)</label>
                <input
                  id="edit-progress"
                  type="number"
                  min="0"
                  max="100"
                  value={edit.progress}
                  onChange={(e) => handleUpdate('progress', parseInt(e.target.value) || 0)}
                  disabled={updating}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="edit-estimatedCost" className="label">Estimasi biaya (opsional, Rp)</label>
                <input
                  id="edit-estimatedCost"
                  type="number"
                  value={edit.estimatedCost ?? ''}
                  onChange={(e) => handleUpdate('estimatedCost', e.target.value ? parseInt(e.target.value) : null)}
                  disabled={updating}
                  className="input"
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={edit.isMilestone}
                    onChange={(e) => handleUpdate('isMilestone', e.target.checked)}
                    disabled={updating}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Milestone
                </label>
              </div>
            </div>
          </div>

          {/* Dependencies */}
          <div className="card p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Ketergantungan</h2>
            <p className="mb-3 text-xs text-gray-500">Pilih tugas pendahulu (Finish-to-Start). Hubungan dibuat lewat menu Manajemen Dependensi untuk tipe lain.</p>
            <div>
              <label htmlFor="dep-predecessor" className="label">Tambah pendahulu</label>
              <input
                id="dep-predecessor"
                type="text"
                placeholder="ID tugas pendahulu (uuid)"
                className="input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value.trim();
                    if (value) {
                      handleAddDependency(value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
            </div>
            <div className="mt-3 space-y-2">
              {dependencies.map((dep) => (
                <div key={dep.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-sm font-medium">{dep.predecessorTitle ?? 'Tidak diketahui'}</span>
                    <span className="ml-2 text-xs text-gray-500">{dep.type} · lag {dep.lagWorkDays} hari kerja</span>
                  </div>
                  <button
                    onClick={() => handleDeleteDependency(dep.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Hapus
                  </button>
                </div>
              ))}
              {dependencies.length === 0 && (
                <p className="text-sm text-gray-400">Belum ada ketergantungan.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Gantt & PERT preview */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Gantt Chart (rentang tugas)</h2>
            <p className="mb-3 text-xs text-gray-500">Preview mini untuk tugas ini dalam konteks acara.</p>
            <div className="min-h-[180px]">
              <GanttChart tasks={[task]} height={220} />
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-2 text-base font-semibold text-gray-900">PERT Network (mini)</h2>
            <p className="mb-3 text-xs text-gray-500">Tampilan hubungan ketergantungan dalam bentuk jaringan.</p>
            <div className="min-h-[180px]">
              <PertDiagram
                nodes={[{
                  id: task.id,
                  title: task.title,
                  duration: task.durationDays ?? 0,
                  isMilestone: !!task.isMilestone,
                  priority: task.priority,
                  status: task.status,
                  progress: task.progress ?? 0,
                  startDate: task.startDate,
                  endDate: task.endDate,
                  isCritical: false,
                  assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
                }]}
                edges={dependencies.map((d) => ({
                  id: d.id,
                  from: d.predecessorId,
                  to: d.taskId,
                  type: d.type,
                  lagWorkDays: d.lagWorkDays,
                  fromTitle: d.predecessorTitle ?? '',
                  toTitle: d.taskTitle ?? '',
                }))}
                height={220}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
