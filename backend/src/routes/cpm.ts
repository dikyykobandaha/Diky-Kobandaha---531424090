import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { computeCpm, toComputedSchedule, type Dependency } from '../services/cpm.js';
import { createScheduleService } from '../services/schedule.js';

const scheduleService = createScheduleService(prisma);

export const router = Router();

// GET /api/cpm/:eventId — hasil CPM lengkap
router.get(
  '/:eventId',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.params.eventId;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organization: { include: { workCalendars: true } } },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }

    const tasks = await prisma.task.findMany({
      where: { eventId },
      select: {
        id: true,
        title: true,
        durationDays: true,
        isMilestone: true,
        startDate: true,
        endDate: true,
      },
      orderBy: [{ isMilestone: 'desc' }, { startDate: 'asc' }],
    });

    const dependencies = await prisma.taskDependency.findMany({
      where: { taskId: { in: tasks.map((t) => t.id) } },
      select: {
        predecessorId: true,
        taskId: true,
        type: true,
        lagWorkDays: true,
      },
    });

    if (tasks.length === 0) {
      return res.json({
        data: {
          event: { id: event.id, name: event.name },
          cpm: null,
          taskCount: 0,
          isEmpty: true,
          message: 'Belum ada tugas. Buat tugas dan dependensi untuk menghitung jalur kritis.',
        },
      });
    }

    const taskNodes = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      durationWorkDays: Math.max(0, t.durationDays),
      isMilestone: t.isMilestone || false,
      startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
      endDate: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
    }));

    const depEdges = dependencies.map((d) => ({
      from: d.predecessorId,
      to: d.taskId,
      type: d.type as any,
      lagWorkDays: d.lagWorkDays,
    }));

    const calendar = event.organization.workCalendars[0];
    const workingDays: number[] = calendar ? JSON.parse(calendar.workingDays) : [1, 2, 3, 4, 5];

    const calendarForCpm = {
      byDayOfWeek: workingDays.map((d) => d === 1 || d === 2 || d === 3 || d === 4 || d === 5),
    };

    const cpmResult = computeCpm(taskNodes, depEdges, calendarForCpm);
    const computedSchedule = toComputedSchedule(cpmResult, calendarForCpm);

    return res.json({
      data: {
        event: {
          id: event.id,
          name: event.name,
        },
        cpm: {
          projectDurationWorkDays: cpmResult.projectDurationWorkDays,
          criticalTaskIds: cpmResult.criticalTaskIds,
          criticalPaths: cpmResult.criticalPaths,
          isolatedTaskIds: cpmResult.isolatedTaskIds,
          errors: cpmResult.errors,
          tasks: cpmResult.tasks.map((t) => ({
            ...t,
            startDate: t.startDateConstraint ?? null,
            endDate: t.endDateConstraint ?? null,
          })),
        },
        computedSchedule: computedSchedule.map((s) => ({
          taskId: s.taskId,
          earliestStart: s.earliestStart?.toISOString().slice(0, 10) || null,
          earliestFinish: s.earliestFinish?.toISOString().slice(0, 10) || null,
          latestStart: s.latestStart?.toISOString().slice(0, 10) || null,
          latestFinish: s.latestFinish?.toISOString().slice(0, 10) || null,
          startDateConstraint: s.startDateConstraint,
          endDateConstraint: s.endDateConstraint,
        })),
        taskCount: tasks.length,
        isEmpty: false,
      },
    });
  })
);

// GET /api/cpm/:eventId/task/:taskId — detail CPM satu tugas
router.get(
  '/:eventId/task/:taskId',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.params.eventId;
    const taskId = req.params.taskId;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organization: true },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId, eventId },
      select: {
        id: true,
        title: true,
        durationDays: true,
        isMilestone: true,
        startDate: true,
        endDate: true,
      },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const dependencies = await prisma.taskDependency.findMany({
      where: { OR: [{ taskId }, { predecessorId: taskId }] },
      include: {
        task: { select: { id: true, title: true } },
        predecessor: { select: { id: true, title: true } },
      },
    });

    const taskNodes = [
      {
        id: task.id,
        title: task.title,
        durationWorkDays: Math.max(0, task.durationDays),
        isMilestone: task.isMilestone || false,
        startDate: task.startDate ? task.startDate.toISOString().slice(0, 10) : null,
        endDate: task.endDate ? task.endDate.toISOString().slice(0, 10) : null,
      },
    ];

    // Re-calculate CPM hanya untuk tugas ini? Sulit karena CPM butuh graph lengkap.
    // Untuk sekarang, kita hitung bersama dengan tugas lain di event.
    const allTasks = await prisma.task.findMany({
      where: { eventId },
      select: {
        id: true,
        title: true,
        durationDays: true,
        isMilestone: true,
        startDate: true,
        endDate: true,
      },
    });

    const allDeps = await prisma.taskDependency.findMany({
      where: { taskId: { in: allTasks.map((t) => t.id) } },
    });

    const calendar = (await prisma.workCalendar.findFirst({
      where: { organizationId: event.organizationId },
    })) || null;
    const workingDays: number[] = calendar ? JSON.parse(calendar.workingDays) : [1, 2, 3, 4, 5];

    const cpmResult = computeCpm(
      allTasks.map((t) => ({
        id: t.id,
        title: t.title,
        durationWorkDays: Math.max(0, t.durationDays),
        isMilestone: t.isMilestone || false,
        startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
        endDate: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
      })),
      allDeps.map((d) => ({
        from: d.predecessorId,
        to: d.taskId,
        type: d.type as any,
        lagWorkDays: d.lagWorkDays,
      })),
      {
        byDayOfWeek: workingDays.map((d) => d === 1 || d === 2 || d === 3 || d === 4 || d === 5),
      }
    );

    const thisTaskCpm = cpmResult.tasks.find((t) => t.id === taskId);
    const predecessors = dependencies
      .filter((d) => d.taskId === taskId)
      .map((d) => ({
        predecessorId: d.predecessorId,
        predecessorTitle: d.predecessor.title,
        type: d.type,
        lagWorkDays: d.lagWorkDays,
      }));
    const successors = dependencies
      .filter((d) => d.predecessorId === taskId)
      .map((d) => ({
        taskId: d.taskId,
        taskTitle: d.task.title,
        type: d.type,
        lagWorkDays: d.lagWorkDays,
      }));

    return res.json({
      data: {
        id: task.id,
        title: task.title,
        durationDays: task.durationDays,
        isMilestone: task.isMilestone,
        startDate: task.startDate?.toISOString().slice(0, 10) || null,
        endDate: task.endDate?.toISOString().slice(0, 10) || null,
        cpm: thisTaskCpm
          ? {
              earliestStartWorkDay: thisTaskCpm.earliestStartWorkDay,
              earliestFinishWorkDay: thisTaskCpm.earliestFinishWorkDay,
              latestStartWorkDay: thisTaskCpm.latestStartWorkDay,
              latestFinishWorkDay: thisTaskCpm.latestFinishWorkDay,
              floatWorkDays: thisTaskCpm.floatWorkDays,
              isCritical: thisTaskCpm.isCritical,
              predecessors: thisTaskCpm.predecessors,
              successors: thisTaskCpm.successors,
            }
          : null,
        predecessors,
        successors,
        cpmFull: {
          projectDurationWorkDays: cpmResult.projectDurationWorkDays,
          criticalTaskIds: cpmResult.criticalTaskIds,
          criticalPaths: cpmResult.criticalPaths,
          isolatedTaskIds: cpmResult.isolatedTaskIds,
          errors: cpmResult.errors,
        },
      },
    });
  })
);

// POST /api/cpm/:eventId/recalculate — hitung ulang CPM (manual trigger)
router.post(
  '/:eventId/recalculate',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.params.eventId;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organization: { include: { workCalendars: true } } },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat menghitung ulang CPM.'));
    }

    // Recalculate juga jadwal tugas
    await scheduleService.applyScheduleToTasks(eventId);

    return res.json({
      message: 'Perhitungan CPM dan jadwal berhasil dihitung ulang.',
      eventId,
    });
  })
);

// GET /api/cpm/example — contoh jadwal yang dihitung manual untuk test
router.get(
  '/example',
  asyncHandler(async (_req, res) => {
    // Contoh manual dari dokumentasi CPM service
    const tasks = [
      { id: 'A', title: 'Tugas A', durationWorkDays: 3, isMilestone: false },
      { id: 'B', title: 'Tugas B', durationWorkDays: 2, isMilestone: false },
      { id: 'C', title: 'Tugas C (milestone)', durationWorkDays: 1, isMilestone: true },
      { id: 'D', title: 'Tugas D (independent)', durationWorkDays: 2, isMilestone: false },
      { id: 'E', title: 'Tugas E', durationWorkDays: 1, isMilestone: false },
      { id: 'F', title: 'Tugas F (SS)', durationWorkDays: 2, isMilestone: false },
      { id: 'G', title: 'Tugas G (milestone akhir)', durationWorkDays: 0, isMilestone: true },
    ];

    const dependencies = [
      { from: 'A', to: 'B', type: 'FS', lagWorkDays: 1 },
      { from: 'B', to: 'C', type: 'FS', lagWorkDays: 0 },
      { from: 'A', to: 'E', type: 'FS', lagWorkDays: 0 },
      { from: 'A', to: 'F', type: 'SS', lagWorkDays: 0 },
      { from: 'C', to: 'G', type: 'FS', lagWorkDays: 0 },
    ];

    const result = computeCpm(tasks, dependencies as unknown as Dependency[], {
      byDayOfWeek: [false, true, true, true, true, true, false],
    });

    return res.json({
      data: {
        description: 'Contoh jadwal manual untuk validasi CPM.',
        expected: {
          criticalPath: ['A', 'B', 'C', 'G'],
          projectDurationWorkDays: 6,
          floatA: 0,
          floatB: 0,
          floatC: 0,
          floatG: 0,
          floatD: 4,
          floatE: 2,
          floatF: 4,
        },
        result: {
          projectDurationWorkDays: result.projectDurationWorkDays,
          criticalTaskIds: result.criticalTaskIds,
          criticalPaths: result.criticalPaths,
          isolatedTaskIds: result.isolatedTaskIds,
          errors: result.errors,
          tasks: result.tasks,
        },
      },
    });
  })
);
