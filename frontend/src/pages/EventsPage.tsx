import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import { formatDateLong } from '../lib/formatters';
import { EventStatusBadge } from '../components/Badges';
import FormError from '../components/FormError';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import type { Event } from '../types/api';

export default function EventsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const orgId = user?.organizationId ?? '';

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    location: '',
    startDate: '',
    endDate: '',
    status: 'planning',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      setError('Belum tergabung dengan organisasi mana pun.');
      return;
    }
    (async () => {
      try {
        const res = await api.get(`/events?organizationId=${orgId}`);
        setEvents((res.data as { data?: Event[] }).data ?? []);
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  async function handleCreate() {
    if (!form.name.trim()) {
      setCreateError('Nama acara wajib diisi.');
      return;
    }
    if (!form.startDate) {
      setCreateError('Tanggal mulai wajib diisi.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post('/events', { ...form, organizationId: orgId });
      const created = (res.data as { data?: Event }).data;
      if (created) setEvents((prev) => [...prev, created]);
      setShowForm(false);
      setForm({ name: '', description: '', location: '', startDate: '', endDate: '', status: 'planning' });
      addToast('Acara berhasil dibuat.', 'success');
    } catch (err) {
      setCreateError(formatApiError(err));
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat acara...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Acara</h1>
        {orgId && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Acara baru
            </span>
          </button>
        )}
      </div>

      {error && <div className="mb-4 card p-4 text-sm text-red-600">{error}</div>}

      {/* Form acara baru */}
      {showForm && (
        <div className="mb-6 card p-5">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Buat acara baru</h3>
          <FormError error={createError} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <label htmlFor="event-name" className="label">Nama acara <span className="text-red-500">*</span></label>
              <input
                id="event-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="Contoh: Pelaksanaan Wisuda 2026"
              />
            </div>
            <div>
              <label htmlFor="event-startDate" className="label">Tanggal mulai <span className="text-red-500">*</span></label>
              <input
                id="event-startDate"
                type="datetime-local"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="event-endDate" className="label">Tanggal selesai</label>
              <input
                id="event-endDate"
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="event-location" className="label">Lokasi</label>
              <input
                id="event-location"
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="event-status" className="label">Status</label>
              <select
                id="event-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="input"
              >
                <option value="planning">Perencanaan</option>
                <option value="preparation">Persiapan</option>
                <option value="running">Berlangsung</option>
                <option value="finished">Selesai</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="event-description" className="label">Deskripsi</label>
              <textarea
                id="event-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Membuat...' : 'Buat acara'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Daftar acara */}
      {events.length === 0 ? (
        <div className="card p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="mt-3 text-sm text-gray-500">Belum ada acara.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((ev) => (
            <Link key={ev.id} to={`/acara/${ev.id}`} className="card p-5 hover:border-primary-300 transition">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900">{ev.name}</h3>
                <EventStatusBadge status={ev.status} />
              </div>
              {ev.startDate && (
                <p className="mt-2 text-sm text-gray-600">{formatDateLong(ev.startDate)}</p>
              )}
              {ev.location && (
                <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  {ev.location}
                </p>
              )}
              <p className="mt-3 text-xs text-primary-700 font-medium">Lihat detail →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
