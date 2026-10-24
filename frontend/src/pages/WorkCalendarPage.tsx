import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import FormError from '../components/FormError';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import type { WorkCalendar, Holiday } from '../types/api';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export default function WorkCalendarPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const orgId = user?.organizationId ?? '';

  const [calendar, setCalendar] = useState<WorkCalendar | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingDays, setWorkingDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });
  const [addingHoliday, setAddingHoliday] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      setError('Belum tergabung dengan organisasi mana pun.');
      return;
    }
    (async () => {
      try {
        const calRes = await api.get(`/calendar?organizationId=${orgId}`);
        // Endpoint mengembalikan daftar kalender organisasi.
        const calList = (calRes.data as { data?: WorkCalendar[] | WorkCalendar }).data;
        const cal = Array.isArray(calList) ? calList[0] ?? null : calList ?? null;
        setCalendar(cal);
        setWorkingDays(cal?.workingDays ?? [1, 2, 3, 4, 5]);
        if (cal) {
          const holRes = await api.get(`/holidays?calendarId=${cal.id}`);
          setHolidays((holRes.data as { data?: Holiday[] }).data ?? []);
        } else {
          setHolidays([]);
        }
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  function toggleDay(day: number) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function handleSaveCalendar() {
    setSaving(true);
    setError(null);
    try {
      if (calendar) {
        const res = await api.put(`/calendar/${calendar.id}`, { workingDays });
        const updated = (res.data as { data?: WorkCalendar }).data;
        if (updated) setCalendar(updated);
      } else {
        const res = await api.post('/calendar', { organizationId: orgId, name: 'Kalender Kerja Utama', workingDays });
        const created = (res.data as { data?: WorkCalendar }).data;
        if (created) setCalendar(created);
      }
      addToast('Kalender kerja disimpan.', 'success');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddHoliday() {
    if (!calendar) {
      setError('Simpan kalender kerja terlebih dahulu.');
      return;
    }
    if (!newHoliday.name.trim() || !newHoliday.date) {
      setError('Nama dan tanggal hari libur wajib diisi.');
      return;
    }
    setAddingHoliday(true);
    setError(null);
    try {
      const res = await api.post(`/holidays?calendarId=${calendar.id}`, { ...newHoliday, calendarId: calendar.id });
      const created = (res.data as { data?: Holiday }).data;
      if (created) setHolidays((prev) => [...prev, created]);
      setNewHoliday({ name: '', date: '' });
      addToast('Hari libur ditambahkan.', 'success');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setAddingHoliday(false);
    }
  }

  async function handleDeleteHoliday(id: string) {
    try {
      await api.delete(`/holidays/${id}`);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      addToast('Hari libur dihapus.', 'success');
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="mt-3 text-sm text-gray-600">Memuat kalender...</p>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-gray-600">
          Anda belum tergabung dalam organisasi. Buat organisasi terlebih dahulu untuk mengatur
          kalender kerja.
        </p>
        <Link to="/organisasi" className="btn-primary mt-4">Kelola organisasi</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Kalender Kerja</h1>
      <p className="mb-4 text-sm text-gray-500">
        Hari kerja memengaruhi perhitungan durasi tugas, Gantt chart, dan CPM.
      </p>

      {error && <FormError error={error} />}

      <div className="mb-6 card p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Hari kerja</h2>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((name, idx) => (
            <button
              key={idx}
              onClick={() => toggleDay(idx)}
              className={`rounded-lg px-3 py-2 text-sm font-medium border transition ${
                workingDays.includes(idx)
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <button onClick={handleSaveCalendar} disabled={saving || workingDays.length === 0} className="btn-primary">
            {saving ? 'Menyimpan...' : 'Simpan kalender'}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Hari libur ({holidays.length})</h2>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="holiday-name" className="label">Nama libur</label>
            <input
              id="holiday-name"
              type="text"
              value={newHoliday.name}
              onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
              className="input"
              placeholder="Contoh: Libur Nasional"
            />
          </div>
          <div>
            <label htmlFor="holiday-date" className="label">Tanggal</label>
            <input
              id="holiday-date"
              type="date"
              value={newHoliday.date}
              onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
              className="input"
            />
          </div>
          <button onClick={handleAddHoliday} disabled={addingHoliday} className="btn-primary">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Tambah
            </span>
          </button>
        </div>

        {holidays.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada hari libur terdaftar.</p>
        ) : (
          <div className="space-y-2">
            {holidays.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2"
              >
                <div>
                  <span className="text-sm font-medium">{h.name}</span>
                  <span className="ml-2 text-xs text-gray-500">{h.date}</span>
                </div>
                <button
                  onClick={() => handleDeleteHoliday(h.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
