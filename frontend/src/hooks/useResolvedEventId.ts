import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './useAuth';
import type { Event } from '../types/api';

/**
 * Ambil event id dari URL. Jika kosong atau berupa placeholder "default"
 * (dipakai menu sidebar/header), gunakan acara pertama milik organisasi.
 */
export function useResolvedEventId(rawEventId?: string) {
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? '';
  const isPlaceholder = !rawEventId || rawEventId === 'default';
  const [eventId, setEventId] = useState<string | null>(isPlaceholder ? null : (rawEventId as string));
  const [loading, setLoading] = useState(isPlaceholder);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlaceholder) {
      setEventId(rawEventId as string);
      setLoading(false);
      setError(null);
      return;
    }

    if (!organizationId) {
      setEventId(null);
      setLoading(false);
      setError('Anda belum tergabung dalam organisasi. Buat organisasi dan acara terlebih dahulu.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api.get('/events');
        const events = (res.data as { data?: Event[] }).data ?? [];
        if (cancelled) return;
        if (events.length === 0) {
          setEventId(null);
          setError('Belum ada acara. Buat acara terlebih dahulu.');
        } else {
          setEventId(events[0].id);
        }
      } catch {
        if (!cancelled) {
          setEventId(null);
          setError('Belum ada acara yang bisa ditampilkan. Buat organisasi dan acara terlebih dahulu.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawEventId, isPlaceholder, organizationId]);

  return { eventId, loading, error };
}
