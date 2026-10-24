/**
 * Service penjadwalan tugas (schedule service).
 *
 * Aturan:
 * - Tugas dijadwalkan berdasarkan dependensi (FS/SS) dan lag hari kerja.
 * - Menggunakan kalender kerja organisasi (work calendar).
 * - Milestone durasi 0 tetapi tetap punya ES/EF.
 * - Jika ada startDate yang ditetapkan, itu adalah constraint: ES minimal startDate.
 * - Jika tugas tidak memiliki start constraint dan tidak punya predecesor, ES = 0 (indeks dasar).
 *
 * Implementasi ini bersifat sementara/independen dari CPM, untuk keperluan
 * Gantt dan update tanggal mulai/tanggal selesai di tabel Task.
 *
 * Catatan: implementasi ini menggunakan indeks work-day absolut mirip CPM,
 * tapi fokus pada perhitungan tanggal mulai/tanggal selesai fisik.
 */

import { PrismaClient } from '@prisma/client';
import {
  type DayIndex,
  DEFAULT_WORKCALENDAR,
  isWorkingDay,
  addWorkDays,
  workDaysDuration,
  workdayIndexFromDate,
  dateFromWorkdayIndex,
  nextWorkingDay,
} from '../services/workCalendar.js';
import type { WorkCalendarConfig } from './workCalendar.js';

export type ScheduleDep = {
  taskId: string;
  predecessorId: string;
  type: 'FS' | 'SS';
  lagWorkDays: number;
};

export interface ScheduleInput {
  taskId: string;
  durationWorkDays: number;
  isMilestone: boolean;
  startDate?: string | null; // YYYY-MM-DD (constraint)
  endDate?: string | null;
  dependencies: ScheduleDep[];
  calendar: {
    workingDays: DayIndex[];
    holidays: string[];
    timezone?: string;
  };
}

export interface ScheduleResult {
  taskId: string;
  earliestStartWorkDay: number;
  earliestFinishWorkDay: number;
  earliestStartDate: string; // YYYY-MM-DD
  earliestEndDate: string | null; // YYYY-MM-DD (null untuk milestone?)
  startDateConstraint?: string | null;
}

export function createScheduleService(prisma: PrismaClient) {
  return {
    /**
     * Hitung jadwal semua tugas dalam satu event berdasarkan dependensi & calendar.
     * Return map taskId -> ScheduleResult.
     */
    async computeEventSchedule(eventId: string): Promise<Map<string, ScheduleResult>> {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          organization: { include: { workCalendars: { include: { holidays: true } } } },
        },
      });
      if (!event) throw new Error('Acara tidak ditemukan.');

      // Gunakan kalender kerja pertama organisasi
      const calendar = event.organization.workCalendars[0];
      const workingDays: DayIndex[] = calendar
        ? JSON.parse(calendar.workingDays)
        : DEFAULT_WORKCALENDAR.workingDays;
      const holidays = calendar
        ? calendar.holidays.map((h) => h.date.toISOString().slice(0, 10))
        : [];

      const cal: WorkCalendarConfig = {
        workingDays,
        holidays,
        timezone: calendar?.timezone ?? 'Asia/Jakarta',
      };

      const tasks = await prisma.task.findMany({
        where: { eventId },
        select: {
          id: true,
          durationDays: true,
          isMilestone: true,
          startDate: true,
          endDate: true,
        },
      });

      const deps = await prisma.taskDependency.findMany({
        where: { taskId: { in: tasks.map((t) => t.id) } },
        select: {
          taskId: true,
          predecessorId: true,
          type: true,
          lagWorkDays: true,
        },
      });

      const taskMap = new Map(tasks.map((t) => [t.id, t]));
      const depMap = new Map<string, ScheduleDep[]>();
      for (const d of deps) {
        const list = depMap.get(d.taskId) ?? [];
        list.push({ taskId: d.taskId, predecessorId: d.predecessorId, type: d.type as any, lagWorkDays: d.lagWorkDays });
        depMap.set(d.taskId, list);
      }

      // Forward pass
      const es = new Map<string, number>();
      const ef = new Map<string, number>();

      // Inisialisasi ES berdasarkan startDate constraint
      for (const t of tasks) {
        const startConstraint =
          t.startDate && !isNaN(new Date(t.startDate).getTime())
            ? workdayIndexFromDate(new Date(t.startDate), cal)
            : 0;
        es.set(t.id, Math.max(0, startConstraint));
        ef.set(t.id, Math.max(0, startConstraint) + Math.max(0, t.durationDays));
      }

      // Topological order (Kahn) — kita sudah punya prisma, tapi ini local
      const indeg = new Map<string, number>();
      for (const t of tasks) indeg.set(t.id, 0);
      for (const d of deps) {
        if (taskMap.has(d.taskId) && taskMap.has(d.predecessorId)) {
          indeg.set(d.taskId, (indeg.get(d.taskId) ?? 0) + 1);
        }
      }

      const queue: string[] = [];
      for (const [id, deg] of indeg.entries()) {
        if (deg === 0) queue.push(id);
      }

      const successors = new Map<string, string[]>();
      for (const t of tasks) successors.set(t.id, []);
      for (const d of deps) {
        if (taskMap.has(d.taskId) && taskMap.has(d.predecessorId)) {
          successors.get(d.predecessorId)!.push(d.taskId);
        }
      }

      const preds = new Map<string, ScheduleDep[]>();
      for (const t of tasks) preds.set(t.id, []);
      for (const d of deps) {
        if (taskMap.has(d.taskId) && taskMap.has(d.predecessorId)) {
          preds.get(d.taskId)!.push({
          taskId: d.taskId,
          predecessorId: d.predecessorId,
          type: d.type as 'FS' | 'SS',
          lagWorkDays: d.lagWorkDays,
        });
        }
      }

      const processed = [...queue];
      while (processed.length > 0) {
        const cur = processed.shift()!;
        const curEs = es.get(cur) ?? 0;
        const curEf = ef.get(cur) ?? curEs;
        const succList = successors.get(cur) ?? [];
        for (const succId of succList) {
          const depList = preds.get(succId) ?? [];
          const dep = depList.find((d) => d.predecessorId === cur);
          if (!dep) continue;
          let candidate: number;
          if (dep.type === 'FS') {
            candidate = curEf + dep.lagWorkDays;
          } else {
            candidate = curEs + dep.lagWorkDays;
          }
          const curSuccEs = es.get(succId) ?? 0;
          if (candidate > curSuccEs) {
            es.set(succId, candidate);
            const dur = Math.max(0, taskMap.get(succId)?.durationDays ?? 0);
            ef.set(succId, candidate + dur);
          }
        }

        // Kahn step
        for (const succId of (successors.get(cur) ?? [])) {
          const deg = indeg.get(succId) ?? 0;
          if (deg === 1) {
            indeg.set(succId, 0);
            queue.push(succId);
          } else {
            indeg.set(succId, deg - 1);
          }
        }
      }

      const result = new Map<string, ScheduleResult>();
      for (const t of tasks) {
        const earliestStart = es.get(t.id) ?? 0;
        const earliestFinish = ef.get(t.id) ?? 0;
        const startDate = dateFromWorkdayIndex(earliestStart, cal).toISOString().slice(0, 10);
        const endDate =
          t.isMilestone || t.durationDays === 0
            ? startDate
            : dateFromWorkdayIndex(earliestFinish - 1, cal).toISOString().slice(0, 10);

        result.set(t.id, {
          taskId: t.id,
          earliestStartWorkDay: earliestStart,
          earliestFinishWorkDay: earliestFinish,
          earliestStartDate: startDate,
          earliestEndDate: t.isMilestone || t.durationDays === 0 ? startDate : endDate,
          startDateConstraint: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
        });
      }

      return result;
    },

    /**
     * Update tanggal mulai/tanggal selesai tugas di database berdasarkan hasil perhitungan.
     */
    async applyScheduleToTasks(
      eventId: string
    ): Promise<{ updated: number; results: ScheduleResult[] }> {
      const schedule = await this.computeEventSchedule(eventId);
      const results = Array.from(schedule.values());

      // Update tugas: set startDate & endDate sesuai hasil (jika berbeda)
      let updated = 0;
      for (const r of results) {
        const task = await prisma.task.findUnique({ where: { id: r.taskId } });
        if (!task) continue;

        const newStart = r.earliestStartDate;
        const newEnd = r.earliestEndDate;
        const currentStart = task.startDate?.toISOString().slice(0, 10);
        const currentEnd = task.endDate?.toISOString().slice(0, 10);

        if (currentStart !== newStart || currentEnd !== newEnd) {
          await prisma.task.update({
            where: { id: r.taskId },
            data: {
              startDate: new Date(newStart),
              endDate: newEnd ? new Date(newEnd) : null,
            },
          });
          updated++;
        }
      }

      return { updated, results };
    },

    /**
     * Hitung tanggal mulai & selesai fisik untuk satu tugas.
     */
    async computeTaskSchedule(taskId: string): Promise<ScheduleResult | null> {
      const schedule = await this.computeEventSchedule(
        (await prisma.task.findUnique({ where: { id: taskId } }))?.eventId ?? ''
      );
      return schedule.get(taskId) ?? null;
    },
  };
}
