import { describe, it, expect } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { createWorkCalendarService } from '../src/services/workCalendar';

describe('WorkCalendar Service', () => {
  const service = createWorkCalendarService(prisma);

  it('deteksi hari kerja (Senin-Friday) harus benar', () => {
    const result = service.isWorkingDay(new Date('2025-01-06')); // Senin
    expect(result.working).toBe(true);
  });

  it('Sabtu harus non-working', () => {
    const result = service.isWorkingDay(new Date('2025-01-04')); // Sabtu
    expect(result.working).toBe(false);
  });

  it('Minggu harus non-working', () => {
    const result = service.isWorkingDay(new Date('2025-01-05')); // Minggu
    expect(result.working).toBe(false);
  });

  it('hari libur khusus harus dianggap non-working', () => {
    // Libur Nasional 1 Januari (Sabtu - sudah non-working, tapi jelas)
    // Mari pakai tanggal kerja biasa yang ditandai libur
    const wed = new Date('2025-01-08'); // Rabu
    service.addHoliday(wed);

    const result = service.isWorkingDay(wed);
    expect(result.working).toBe(false);
    expect(result.reason).toBe('Hari libur');

    service.removeHoliday(wed);
  });

  it('perhitungan tanggal mulai + durasi hari kerja harus melewati akhir pekan', () => {
    // Senin + 5 hari kerja = Senin berikutnya
    const startDate = new Date('2025-01-06'); // Senin
    const endDate = service.addWorkingDays(startDate, 5);
    // Harusnya Senin minggu depan (2025-01-13)
    expect(endDate.toISOString().slice(0, 10)).toBe('2025-01-13');
  });

  it('perhitungan dengan hari libur harus melewati hari libur', () => {
    const mon = new Date('2025-01-06'); // Senin
    const wed = new Date('2025-01-08'); // Rabu (hari libur)

    service.addHoliday(wed);

    // Senin + 1 hari kerja = Selasa (1/7)
    // Senin + 2 hari kerja = Selasa + melewati Rabu libur = Kamis (1/9)
    const result = service.addWorkingDays(mon, 2);
    expect(result.toISOString().slice(0, 10)).toBe('2025-01-09');

    service.removeHoliday(wed);
  });
});
