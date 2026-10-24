import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDateLong, formatDateTime, formatDurationHuman } from '../lib/formatters';
import { EventStatusBadge } from '../components/Badges';
import FormError from '../components/FormError';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import type { Event, EventWithMeta } from '../types/api';
import type { TaskWithSchedule } from '../types/api';

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [event, setEvent] = useState<EventWithMeta | null>(null);
  const [tasks, setTasks] = useState<TaskWithSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    location: '',
    startDate: '',
    endDate: '',
    status: 'planning' as any,
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const res = await api.get(`/events/${eventId}`);
        const eventBody = (res.data as { data?: EventWithMeta }).data;
        setEvent(eventBody ?? null);
        const res2 = await api.get(`/tasks?eventId=${eventId}`);
        setTasks((res2.data as { data?: TaskWithSchedule[] }).data ?? []);
      } catch (err) {
        setError('Gagal memuat data acara.');
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  async function handleEdit() {
    if (!event) return;
    setEditForm({
      name: event.name,
      description: event.description ?? '',
      location: event.location ?? '',
      startDate: event.startDate?.slice(0, 16) ?? '',
      endDate: event.endDate?.slice(0, 16) ?? '',
      status: event.status,
    });
    setEditing(true);
    setSaveError(null);
  }

  async function handleSaveEdit() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.put(`/events/${eventId}`, editForm);
      const updated = (res.data as { data?: Event }).data;
      if (updated) {
        setEvent({ ...updated, memberCount: event?.memberCount, taskCount: event?.taskCount, progress: event?.progress });
      }
      setEditing(false);
      addToast('Acara berhasil diperbarui.', 'success');
    } catch (err) {
      setSaveError('Gagal memperbarui acara.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/events/${eventId}`);
      addToast('Acara berhasil dihapus.', 'success');
      navigate('/acara');
    } catch {
      addToast('Gagal menghapus acara.', 'error');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat acara...</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-600">{error ?? 'Acara tidak ditemukan.'}</p>
        <Link to="/acara" className="btn-secondary mt-4">Kembali ke daftar acara</Link>
      </div>
    );
  }

  const memberIds = event.memberIds ?? [];
  const memberCount = event.memberCount ?? memberIds.length;
  const taskCount = event.taskCount ?? tasks.length;
  const progress =
    event.progress ??
    (tasks.length > 0 ? Math.round(tasks.reduce((a, t) => a + t.progress, 0) / tasks.length) : 0);
  const members = event.members ?? [];
  const myEntry = members.find((m) => m.user?.id === user?.id);
  const canManage = user?.id === event.ownerId || myEntry?.role === 'admin' || myEntry?.role === 'owner';

  function findMember(id: string) {
    return members.find((m) => m.user && m.user.id === id);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
        <div className="flex items-center gap-2">
          <Link to={`/gantt/${eventId}`} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Gantt Chart
            </span>
          </Link>
          <Link to={`/pert/${eventId}`} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              PERT Diagram
            </span>
          </Link>
          <Link to={`/jalur-kritis/${eventId}`} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Jalur Kritis
            </span>
          </Link>
          {canManage ? (
            <button onClick={handleEdit} className="btn-secondary">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </span>
            </button>
          ) : null}
          {canManage && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="btn-danger"
            >
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Hapus
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="mb-4">
          <div className="card border-red-300 bg-red-50 p-4">
            <h3 className="text-base font-semibold text-red-800">Konfirmasi hapus</h3>
            <p className="mt-1 text-sm text-red-700">
              Yakin ingin menghapus acara "{event.name}"? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={handleDelete} disabled={deleting} className="btn-danger">
                {deleting ? 'Menghapus...' : 'Hapus acara'}
              </button>
              <button onClick={() => setDeleteConfirm(false)} className="btn-secondary">
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Info card */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <EventStatusBadge status={event.status} />
              {event.location && (
                <p className="mt-2 text-sm text-gray-600 flex items-center gap-1.5">
                  <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {event.location}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Dibuat: {formatDateLong(event.createdAt)}</p>
              {event.updatedAt !== event.createdAt && (
                <p>Diperbarui: {formatDateLong(event.updatedAt)}</p>
              )}
            </div>
          </div>

          {event.description && (
            <p className="mt-4 text-gray-700 whitespace-pre-wrap">{event.description}</p>
          )}

          <div className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Informasi</h3>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Tanggal mulai</dt>
                <dd className="text-gray-900 font-medium">{event.startDate ? formatDateTime(event.startDate) : '-'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Tanggal selesai</dt>
                <dd className="text-gray-900 font-medium">{event.endDate ? formatDateTime(event.endDate) : '-'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Durasi</dt>
                <dd className="text-gray-900 font-medium">
                  {event.startDate && event.endDate
                    ? formatDurationHuman(
                        (new Date(event.endDate).getTime() - new Date(event.startDate).getTime()) /
                          60000
                      )
                    : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Pemilik</dt>
                <dd className="text-gray-900 font-medium">{event.ownerName ?? '-'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Stats card */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900">Ringkasan</h3>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-primary-50 p-3">
              <dt className="text-xs text-primary-700">Total Tugas</dt>
              <dd className="text-2xl font-bold text-primary-700">{taskCount}</dd>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <dt className="text-xs text-emerald-700">Progres</dt>
              <dd className="text-2xl font-bold text-emerald-700">{progress}%</dd>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <dt className="text-xs text-amber-700">Anggota Panitia</dt>
              <dd className="text-2xl font-bold text-amber-700">{memberCount}</dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-600">Status</dt>
              <dd className="text-lg font-medium text-gray-900 capitalize">{event.status}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="mt-6 card p-5">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Edit acara</h3>
          <FormError error={saveError} />
          <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-name" className="label">Nama acara</label>
              <input
                id="edit-name"
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="edit-status" className="label">Status</label>
              <select
                id="edit-status"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="input"
              >
                <option value="planning">Perencanaan</option>
                <option value="preparation">Persiapan</option>
                <option value="running">Berlangsung</option>
                <option value="finished">Selesai</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-location" className="label">Lokasi</label>
              <input
                id="edit-location"
                type="text"
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="edit-description" className="label">Deskripsi</label>
              <textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="input min-h-[80px]"
                rows={3}
              />
            </div>
            <div>
              <label htmlFor="edit-startDate" className="label">Tanggal mulai</label>
              <input
                id="edit-startDate"
                type="datetime-local"
                required
                value={editForm.startDate}
                onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="edit-endDate" className="label">Tanggal selesai (opsional)</label>
              <input
                id="edit-endDate"
                type="datetime-local"
                value={editForm.endDate}
                onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                className="input"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Menyimpan...' : 'Simpan perubahan'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Anggota panitia */}
      <div className="mt-6 card p-5">
        <h3 className="text-base font-semibold text-gray-900">Anggota Panitia</h3>
        {memberIds.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {memberIds.map((id) => (
              <div key={id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 text-sm font-semibold flex items-center justify-center">
                  {findMember(id)?.user?.name?.slice(0, 2).toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {findMember(id)?.user?.name ?? 'Anggota'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {findMember(id)?.role === 'owner' && 'Pemilik'}
                    {findMember(id)?.role === 'admin' && 'Admin'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Belum ada anggota yang ditambahkan.</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-6 card p-5">
        <h3 className="text-base font-semibold text-gray-900">Aksi cepat</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`/tugas?eventId=${eventId}`} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Kelola tugas
            </span>
          </Link>
          <Link to={`/gantt/${eventId}`} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Lihat Gantt Chart
            </span>
          </Link>
          <Link to={`/jalur-kritis/${eventId}`} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Jalur Kritis (CPM)
            </span>
          </Link>
          <Link to={`/analitik?eventId=${eventId}`} className="btn-secondary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analitik
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
