import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Event } from '../types/api';

interface EventSelectorProps {
  eventId: string;
  onChange: (eventId: string) => void;
}

/** Dropdown untuk memilih acara (digunakan di halaman analitik). */
export function EventSelector({ eventId, onChange }: EventSelectorProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/events');
        const list = (res.data as { data?: Event[] }).data ?? [];
        if (!cancelled) setEvents(list);
      } catch {
        // Diamkan: daftar acara gagal dimuat, dropdown tetap tampil.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="event-selector" className="text-sm font-medium text-gray-700">
        Acara:
      </label>
      <select
        id="event-selector"
        value={eventId}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || events.length === 0}
        className="input w-auto"
      >
        {events.length === 0 ? (
          <option value="">{loading ? 'Memuat...' : 'Tidak ada acara'}</option>
        ) : (
          events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))
        )}
      </select>
    </div>
  );
}

export default EventSelector;
