import { describe, it, expect } from 'vitest';
import { createCPMService, type CPMInput, type CPMOutput } from '../src/services/cpm';

describe('CPM Service', () => {
  it('sebuah tugas tanpa dependensi: ES=0, EF=durasi, LS=0, LF=durasi, float=0, critical', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: '1', durationDays: 5, startDate: null },
      ],
      dependencies: [],
      workCalendar: {
        workingDays: [1, 2, 3, 4, 5], // Senin-Friday
        exceptions: [],
      },
    });

    expect(cpm.tasks['1']).toEqual({
      earliestStart: 0,
      earliestFinish: 5,
      latestStart: 0,
      latestFinish: 5,
      totalFloat: 0,
      isCritical: true,
    });
    expect(cpm.projectDuration).toBe(5);
    expect(cpm.criticalPath).toEqual(['1']);
  });

  it('dua tugas berurutan F2S dengan lag 2: durasi total = durasi tugas1 + lag + durasi tugas2', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'A', durationDays: 3, startDate: null },
        { id: 'B', durationDays: 4, startDate: null },
      ],
      dependencies: [
        { type: 'F2S', predecessorId: 'A', successorId: 'B', lagDays: 2 },
      ],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    const a = cpm.tasks['A'];
    const b = cpm.tasks['B'];

    expect(a.earliestStart).toBe(0);
    expect(a.earliestFinish).toBe(3);
    expect(b.earliestStart).toBe(5); // EF A (3) + lag (2) = 5
    expect(b.earliestFinish).toBe(9);
    expect(a.totalFloat).toBe(0);
    expect(b.totalFloat).toBe(0);
    expect(cpm.projectDuration).toBe(9);
    expect(cpm.criticalPath).toEqual(['A', 'B']);
  });

  it('S2S dengan lag 1: ES penerus = ES pendahulu + lag', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'P', durationDays: 2, startDate: null },
        { id: 'Q', durationDays: 3, startDate: null },
      ],
      dependencies: [
        { type: 'S2S', predecessorId: 'P', successorId: 'Q', lagDays: 1 },
      ],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    const p = cpm.tasks['P'];
    const q = cpm.tasks['Q'];

    expect(p.earliestStart).toBe(0);
    expect(p.earliestFinish).toBe(2);
    expect(q.earliestStart).toBe(1); // ES P (0) + lag (1) = 1
    expect(q.earliestFinish).toBe(4);
    expect(p.totalFloat).toBe(0); // P kritis karena EF-nya menentukan batas
    expect(q.totalFloat).toBe(0);
    expect(cpm.projectDuration).toBe(4);
    expect(cpm.criticalPath).toEqual(['P', 'Q']);
  });

  it('float positif untuk tugas yang tidak menentukan batas projek', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'X', durationDays: 2, startDate: null },
        { id: 'Y', durationDays: 5, startDate: null },
        { id: 'Z', durationDays: 1, startDate: null },
      ],
      dependencies: [
        { type: 'F2S', predecessorId: 'X', successorId: 'Y', lagDays: 0 },
        { type: 'F2S', predecessorId: 'Y', successorId: 'Z', lagDays: 0 },
      ],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    const x = cpm.tasks['X'];
    const y = cpm.tasks['Y'];
    const z = cpm.tasks['Z'];

    // Jalur: X(2) -> Y(5) -> Z(1) = total 8 hari
    // Semua kritis karena single path
    expect(x.isCritical).toBe(true);
    expect(y.isCritical).toBe(true);
    expect(z.isCritical).toBe(true);
    expect(cpm.projectDuration).toBe(8);
  });

  it('float positif untuk tugas paralel yang lebih pendek', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'Fast', durationDays: 2, startDate: null },
        { id: 'Slow', durationDays: 5, startDate: null },
        { id: 'Merge', durationDays: 1, startDate: null },
      ],
      dependencies: [
        { type: 'F2S', predecessorId: 'Fast', successorId: 'Merge', lagDays: 0 },
        { type: 'F2S', predecessorId: 'Slow', successorId: 'Merge', lagDays: 0 },
      ],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    const fast = cpm.tasks['Fast'];
    const slow = cpm.tasks['Slow'];
    const merge = cpm.tasks['Merge'];

    // Jalur: Fast(2) -> Merge(1) vs Slow(5) -> Merge(1)
    // Slow adalah jalur kritis (total 6 hari)
    // Fast selesai di 2, tapi Merge kritis dimulai di 5 (EF Slow), jadi Fast punya float 3
    expect(slow.isCritical).toBe(true);
    expect(merge.isCritical).toBe(true);
    expect(fast.isCritical).toBe(false);
    expect(fast.totalFloat).toBe(3); // 5 - 2 = 3 hari float
    expect(cpm.projectDuration).toBe(6);
    expect(cpm.criticalPath).toEqual(['Slow', 'Merge']);
  });

  it('siklus ketergantungan: harus melempar error dengan pesan jelas', () => {
    const service = createCPMService(prisma);
    const cpmFn = () => service.computeCPM({
      tasks: [
        { id: '1', durationDays: 1, startDate: null },
        { id: '2', durationDays: 1, startDate: null },
      ],
      dependencies: [
        { type: 'F2S', predecessorId: '1', successorId: '2', lagDays: 0 },
        { type: 'F2S', predecessorId: '2', successorId: '1', lagDays: 0 },
      ],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    expect(cpmFn).toThrow(/siklus/i);
  });

  it('tugas tanpa dependensi: dihitung secara independen, tidak masuk jalur kritis utama', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'Main', durationDays: 4, startDate: null },
        { id: 'Isolated', durationDays: 2, startDate: null },
      ],
      dependencies: [],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    // Main kritis (jalur utama 4 hari), Isolated kritis (single path sendiri)
    // Kedua keduanya "critical" karena durasi masing-masing menentukan batas sendiri
    expect(cpm.tasks['Main'].isCritical).toBe(true);
    expect(cpm.tasks['Isolated'].isCritical).toBe(true);
    expect(cpm.projectDuration).toBe(4); // hanya jalur utama
    expect(cpm.criticalPath).toEqual(['Main']);
    expect(cpm.independentPaths).toBeDefined();
    expect(cpm.independentPaths).toContain('Isolated');
  });

  it('milestone berdurasi 0: ES=EF,float dihitung dengan benar', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'M', durationDays: 0, startDate: null },
      ],
      dependencies: [],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    const m = cpm.tasks['M'];
    expect(m.earliestStart).toBe(0);
    expect(m.earliestFinish).toBe(0);
    expect(m.totalFloat).toBe(0);
    expect(m.isCritical).toBe(true);
    expect(cpm.projectDuration).toBe(0);
  });

  it('projek kosong: harus mengembalikan objek valid dengan projectDuration 0', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [],
      dependencies: [],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    expect(cpm.projectDuration).toBe(0);
    expect(cpm.criticalPath).toEqual([]);
    expect(Object.keys(cpm.tasks)).toHaveLength(0);
  });

  it('lag negatif (lead): ES penerus lebih cepat dari EF pendahulu', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'A', durationDays: 5, startDate: null },
        { id: 'B', durationDays: 2, startDate: null },
      ],
      dependencies: [
        { type: 'F2S', predecessorId: 'A', successorId: 'B', lagDays: -2 },
      ],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    const b = cpm.tasks['B'];
    // EF A = 5, lag -2 -> ES B = 3
    expect(b.earliestStart).toBe(3);
    expect(b.earliestFinish).toBe(5);
    // Karena B selesai tepat di 5 (sama dengan EF A), keduanya kritis
    expect(cpm.projectDuration).toBe(5);
    expect(cpm.criticalPath).toEqual(['A', 'B']);
  });

  it(' beberapa jalur paralel dengan durasi sama: semua jalur kritis', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'A', durationDays: 3, startDate: null },
        { id: 'B', durationDays: 3, startDate: null },
        { id: 'C', durationDays: 3, startDate: null },
        { id: 'End', durationDays: 1, startDate: null },
      ],
      dependencies: [
        { type: 'F2S', predecessorId: 'A', successorId: 'End', lagDays: 0 },
        { type: 'F2S', predecessorId: 'B', successorId: 'End', lagDays: 0 },
        { type: 'F2S', predecessorId: 'C', successorId: 'End', lagDays: 0 },
      ],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    // Semua jalur durasi 3+1=4 hari, semuanya kritis
    const a = cpm.tasks['A'];
    const b = cpm.tasks['B'];
    const c = cpm.tasks['C'];
    const end = cpm.tasks['End'];

    expect(a.isCritical).toBe(true);
    expect(b.isCritical).toBe(true);
    expect(c.isCritical).toBe(true);
    expect(end.isCritical).toBe(true);
    expect(cpm.projectDuration).toBe(4);
    expect(cpm.criticalPath).toEqual(['A', 'B', 'C', 'End']);
  });

  it('tugas dengan startDate menghasilkan jadwal mundur (backward pass) dengan benar', () => {
    const service = createCPMService(prisma);
    const cpm = service.computeCPM({
      tasks: [
        { id: 'A', durationDays: 3, startDate: new Date('2025-01-06') }, // Senin
        { id: 'B', durationDays: 2, startDate: null },
      ],
      dependencies: [
        { type: 'F2S', predecessorId: 'A', successorId: 'B', lagDays: 0 },
      ],
      workCalendar: { workingDays: [1,2,3,4,5], exceptions: [] },
    });

    const a = cpm.tasks['A'];
    const b = cpm.tasks['B'];

    // A: ES = 0 (tanggal mulai sudah fixed)
    expect(a.earliestStart).toBe(0);
    expect(a.earliestFinish).toBe(3);
    // B: ES = EF A = 3
    expect(b.earliestStart).toBe(3);
    expect(b.earliestFinish).toBe(5);
    expect(cpm.projectDuration).toBe(5);
  });
});
