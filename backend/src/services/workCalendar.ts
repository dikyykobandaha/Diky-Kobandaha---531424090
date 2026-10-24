/**
 * Service kalender kerja.
 *
 * Aturan:
 * - Default: Senin–Jumat hari kerja, Sabtu-Minggu libur.
 * - Holidays: daftar tanggal libur (YYYY-MM-DD) yang ditambahkan sebagai non-working day.
 * - WorkdaysOfWeek: array index 0..6 (0=Minggu..6=Sabtu) yang ditandai hari kerja.
 *
 * Semua durasi dalam SATUAN HARI KERJA (work day). Lag juga dalam hari kerja.
 *
 * Catatan implementasi:
 * - Kami memberikan fungsi pure yang menerima daftar holidays (string YYYY-MM-DD) +
 *   workingDays (0..6) agar dapat digunakan tanpa Prisma di service lain (mis. CPM).
 * - Versi "dengan Prisma" (mengambil dari DB) berada di file service terpisah atau
 *   di route; tapi untuk konsistensi logika, fungsi ini digunakan bersama.
 */

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkCalendarConfig {
  workingDays: DayIndex[];   // default [1,2,3,4,5]
  holidays: string[];        // YYYY-MM-DD libur tetap
  timezone?: string;
}

/** Default konfigurasi kalender kerja (Senin–Jumat) */
export const DEFAULT_WORKCALENDAR: WorkCalendarConfig = {
  workingDays: [1, 2, 3, 4, 5] as DayIndex[],
  holidays: [],
  timezone: 'Asia/Jakarta',
};

/** Nama hari Indonesia (untuk tampilan) */
export const DAY_NAMES: Record<DayIndex, string> = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
};

/** Apakah suatu tanggal adalah hari kerja berdasarkan config */
export function isWorkingDay(
  date: Date,
  config: WorkCalendarConfig
): boolean {
  const dayOfWeek = date.getDay() as DayIndex;
  if (!config.workingDays.includes(dayOfWeek)) return false;
  // Cek holiday
  const key = formatDateYYYYMMDD(date);
  if (config.holidays.includes(key)) return false;
  return true;
}

/** Format YYYY-MM-DD dari Date (local) */
export function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Tambah N hari kerja ke tanggal, melewati libur & weekend */
export function addWorkDays(date: Date, workDays: number, config: WorkCalendarConfig): Date {
  if (workDays <= 0) return new Date(date);
  const d = new Date(date);
  let remaining = Math.floor(workDays);
  // Gerakkan 1 hari per iterasi; jika hari kerja, kurangi remaining.
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, config)) {
      remaining--;
    }
  }
  return d;
}

/** Hitung jumlah hari kerja antara dateFrom (eksklusif) dan dateTo (inklusif?) */
export function countWorkDaysBetween(
  dateFrom: Date,
  dateTo: Date,
  config: WorkCalendarConfig
): number {
  let count = 0;
  const d = new Date(dateFrom);
  while (d < dateTo) {
    if (isWorkingDay(d, config)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Hitung durasi dalam hari kerja antara dua tanggal (start dan end).
 * Jika start == end → 0 hari kerja (mis. milestone durasi 0).
 */
export function workDaysDuration(
  start: Date,
  end: Date,
  config: WorkCalendarConfig
): number {
  if (end <= start) return 0;
  return countWorkDaysBetween(start, end, config);
}

/**
 * Hitung tanggal mulai (work-day) dari indeks absolut.
 * Menggunakan epoch 1 Jan 1970 sebagai basis index 0 (hari pertama yang kerja? tidak, basis harian).
 * Namun agar konsisten dengan CPM service, kita definisikan:
 *    workdayIndex(date) = jumlah hari kerja dari epoch hingga date (eksklusif date).
 * Ini digunakan untuk constraint tanggal mulai.
 */
export function workdayIndexFromDate(date: Date, config: WorkCalendarConfig): number {
  const epoch = new Date(1970, 0, 1);
  let count = 0;
  const d = new Date(epoch);
  while (d < date) {
    if (isWorkingDay(d, config)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Konversi indeks work-day absolut ke Date.
 */
export function dateFromWorkdayIndex(workdayIndex: number, config: WorkCalendarConfig): Date {
  const epoch = new Date(1970, 0, 1);
  const d = new Date(epoch);
  let count = 0;
  while (count < workdayIndex) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, config)) count++;
  }
  return d;
}

/**
 * Cari hari kerja berikutnya dari suatu tanggal (termasuk tanggal itu sendiri jika kerja).
 */
export function nextWorkingDay(date: Date, config: WorkCalendarConfig): Date {
  const d = new Date(date);
  while (!isWorkingDay(d, config)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * Hitung lags: tambahkan N hari kerja ke timestamp tertentu.
 * Mirip addWorkDays tapi nama domain "lag".
 */
export function addLagWorkDays(
  fromDate: Date,
  lagWorkDays: number,
  config: WorkCalendarConfig
): Date {
  return addWorkDays(fromDate, lagWorkDays, config);
}

/**
 * Tentukan apakah dua periode waktu bertabrakan (overlap).
 * Periode [aStart, aEnd] dan [bStart, bEnd] overlap jika
 * aStart <= bEnd && bStart <= aEnd (inklusif).
 */
export function periodsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Hitung total hari kerja dalam satu minggu (untuk estimasi kapasitas, opsional).
 * Default: 5 hari.
 */
export function workdaysPerWeek(config: WorkCalendarConfig): number {
  // Hitung dari Senin (index 1) ke Minggu berikutnya (index 0 berikutnya)
  const senin = new Date(2024, 0, 1); // Senin 1 Jan 2024?
  // Lebih baik: ambil sembarang minggu dan hitung hari kerja
  const sample = new Date(2024, 0, 1); // 1 Jan 2024 = Senin? check
  let count = 0;
  const d = new Date(sample);
  for (let i = 0; i < 7; i++) {
    if (isWorkingDay(d, config)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count || 5; // fallback
}

/**
 * Bentuk rentang tanggal mulai–selesai dalam hari kerja.
 * Return { startDate, endDate } sebagai Date.
 */
export function scheduleRange(
  startDate: Date,
  durationWorkDays: number,
  config: WorkCalendarConfig
): { startDate: Date; endDate: Date } {
  const start = nextWorkingDay(startDate, config);
  const end = addWorkDays(start, Math.max(0, durationWorkDays) - 1, config); // -1 karena start dihitung sebagai hari ke-1
  return { startDate: start, endDate: end };
}

/**
 * Sesuaikan tanggal mulai agar tidak jatuh di hari libur: pindahkan ke hari kerja berikutnya.
 */
export function adjustToWorkingDay(date: Date, config: WorkCalendarConfig): Date {
  return nextWorkingDay(date, config);
}

/**
 * Apakah suatu periode cuti (leave period) berpotongan dengan rentang tanggal tugas.
 */
export function leaveOverlapsTask(
  leaveStart: Date,
  leaveEnd: Date,
  taskStart: Date,
  taskEnd: Date
): boolean {
  return periodsOverlap(leaveStart, leaveEnd, taskStart, taskEnd);
}
