/**
 * Utilities format tanggal dan durasi Bahasa Indonesia.
 */

/** Nama hari bahasa Indonesia (Senin..Minggu) */
export const hariIndonesia = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
] as const;

/** Nama bulan bahasa Indonesia */
export const bulanIndonesia = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

/**
 * Format tanggal lengkap seperti "Senin, 1 November 2026".
 */
export function formatDateLong(date: Date | string | number): string {
  const d = toDate(date);
  if (!d) return '-';
  const dayName = hariIndonesia[d.getDay()];
  const day = d.getDate();
  const month = bulanIndonesia[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${day} ${month} ${year}`;
}

/**
 * Format tanggal singkat seperti "1 Nov 2026".
 */
export function formatDateShort(date: Date | string | number): string {
  const d = toDate(date);
  if (!d) return '-';
  const day = d.getDate();
  const month = bulanIndonesia[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format tanggal + waktu seperti "Senin, 1 Nov 2026, 09:00".
 */
export function formatDateTime(date: Date | string | number): string {
  const d = toDate(date);
  if (!d) return '-';
  const datePart = formatDateShort(d);
  const time = formatTime(d);
  return `${datePart}, ${time}`;
}

/**
 * Format waktu saja seperti "09:00" atau "09:00–12:00".
 */
export function formatTime(date: Date | string | number): string {
  const d = toDate(date);
  if (!d) return '-';
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Format rentang waktu seperti "09:00 s.d. 17:00" */
export function formatTimeRange(start: Date | string | number | null, end: Date | string | number | null): string {
  if (!start && !end) return '-';
  const s = start ? formatTime(start) : '-';
  const e = end ? formatTime(end) : '-';
  return `${s} s.d. ${e}`;
}

/** Bulatkan detik ke menit terdekat untuk tampilan */
export function formatDurationHuman(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '-';
  const totalHours = totalMinutes / 60;
  if (totalHours < 1) {
    const m = Math.round(totalMinutes);
    return m === 1 ? '1 menit' : `${m} menit`;
  }
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(hours === 1 ? '1 jam' : `${hours} jam`);
  if (minutes > 0) parts.push(minutes === 1 ? '1 menit' : `${minutes} menit`);
  return parts.join(' ');
}

/**
 * Hitung total menit antara dua timestamp (floor ke menit terdekat).
 * Hasil bisa negatif jika end sebelum start.
 */
export function diffMinutes(start: Date | string | number, end: Date | string | number): number {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return 0;
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

export function toDate(value: Date | string | number): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Opsi sort tugas berdasarkan berbagai kriteria */
export const taskSortOptions = [
  { value: 'default', label: 'Urutan default' },
  { value: 'startDate-asc', label: 'Tanggal mulai (terawal)' },
  { value: 'startDate-desc', label: 'Tanggal mulai (terakhir)' },
  { value: 'dueDate-asc', label: 'Tanggal selesai (terawal)' },
  { value: 'dueDate-desc', label: 'Tanggal selesai (terakhir)' },
  { value: 'priority-desc', label: 'Prioritas (tertinggi)' },
  { value: 'title-asc', label: 'Judul (A–Z)' },
  { value: 'title-desc', label: 'Judul (Z–A)' },
  { value: 'progress-asc', label: 'Progres (rendah)' },
  { value: 'progress-desc', label: 'Progres (tinggi)' },
] as const;
