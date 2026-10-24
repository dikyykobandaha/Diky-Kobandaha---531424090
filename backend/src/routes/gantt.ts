import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { computeCpm, toComputedSchedule } from '../services/cpm.js';
import { createScheduleService } from '../services/schedule.js';

const scheduleService = createScheduleService(prisma);

export const router = Router();

// GET /api/gantt/:eventId — data Gantt Chart lengkap (tugas, dependensi, CPM)
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

    // Filter status / prioritas / penanggung jawab dari query
    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const assigneeId = req.query.assigneeId as string | undefined;

    const where: any = { eventId };
    if (status && status !== 'all') {
      where.status = status;
    }
    if (priority && priority !== 'all') {
      where.priority = priority;
    }
    if (assigneeId) {
      where.OR = [
        { assigneeId },
        { assigneeIds: { contains: JSON.stringify([assigneeId]) } },
        { taskMembers: { some: { userId: assigneeId } } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        taskMembers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { children: true } },
      },
      orderBy: [
        { isMilestone: 'desc' },
        { parentId: 'asc' },
        { startDate: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    const dependencies = await prisma.taskDependency.findMany({
      where: { taskId: { in: tasks.map((t) => t.id) } },
      include: {
        task: { select: { id: true, title: true } },
        predecessor: { select: { id: true, title: true } },
      },
    });

    // Hitung CPM jika ada tugas
    let cpmResult = null;
    let computedSchedule: ReturnType<typeof toComputedSchedule> = [];
    if (tasks.length > 0) {
      const taskNodes = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        durationWorkDays: Math.max(0, t.durationDays),
        isMilestone: t.isMilestone,
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

      cpmResult = computeCpm(taskNodes, depEdges, {
        byDayOfWeek: workingDays.map((d) => d === 1 || d === 2 || d === 3 || d === 4 || d === 5),
      });

      computedSchedule = toComputedSchedule(cpmResult, {
        byDayOfWeek: workingDays.map((d) => d === 1 || d === 2 || d === 3 || d === 4 || d === 5),
      });
    }

    // Hitung progress rata-rata
    const taskCount = tasks.length;
    let progress = 0;
    if (taskCount > 0) {
      const sum = await prisma.task.aggregate({
        where: { eventId },
        _sum: { progress: true },
      });
      progress = Math.round((sum._sum.progress || 0) / taskCount);
    }

    // Build data tugas dengan schedule
    const taskData = tasks.map((t) => {
      const assigneeIds = (t.assigneeIds ? JSON.parse(t.assigneeIds) : []) as string[];
      const taskMemberIds = t.taskMembers.map((m) => m.userId);
      const allAssigneeIds = [...new Set([t.assigneeId, ...assigneeIds, ...taskMemberIds])].filter(Boolean);

      const schedule = computedSchedule.find((s) => s.taskId === t.id);
      const cpmTask = cpmResult?.tasks.find((c) => c.id === t.id);

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        eventId: t.eventId,
        parentId: t.parentId,
        startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
        endDate: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
        durationDays: t.durationDays,
        priority: t.priority,
        status: t.status,
        progress: t.progress,
        isMilestone: t.isMilestone,
        assigneeId: t.assigneeId,
        assignee: t.assignee,
        assigneeIds: allAssigneeIds,
        taskMembers: t.taskMembers.map((m) => ({
          id: m.id,
          userId: m.userId,
          user: m.user,
        })),
        childrenCount: t._count.children,
        // CPM data
        earliestStart: schedule?.earliestStart?.toISOString().slice(0, 10) || null,
        earliestFinish: schedule?.earliestFinish?.toISOString().slice(0, 10) || null,
        floatWorkDays: cpmTask?.floatWorkDays ?? null,
        isCritical: cpmTask?.isCritical ?? false,
        dependenciesFrom: dependencies
          .filter((d) => d.taskId === t.id)
          .map((d) => ({
            predecessorId: d.predecessorId,
            predecessorTitle: d.predecessor.title,
            type: d.type,
            lagWorkDays: d.lagWorkDays,
          })),
        dependenciesTo: dependencies
          .filter((d) => d.predecessorId === t.id)
          .map((d) => ({
            taskId: d.taskId,
            taskTitle: d.task.title,
            type: d.type,
            lagWorkDays: d.lagWorkDays,
          })),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    return res.json({
      data: {
        event: {
          id: event.id,
          name: event.name,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate?.toISOString() || null,
          status: event.status,
        },
        tasks: taskData,
        dependencies: dependencies.map((d) => ({
          id: d.id,
          taskId: d.taskId,
          predecessorId: d.predecessorId,
          type: d.type,
          lagWorkDays: d.lagWorkDays,
        })),
        cpm: cpmResult
          ? {
              projectDurationWorkDays: cpmResult.projectDurationWorkDays,
              criticalTaskIds: cpmResult.criticalTaskIds,
              criticalPaths: cpmResult.criticalPaths,
              isolatedTaskIds: cpmResult.isolatedTaskIds,
              errors: cpmResult.errors,
            }
          : null,
        progress,
        taskCount,
      },
    });
  })
);

// GET /api/gantt/:eventId/zoom — времiansi rentang waktu Gantt
router.get(
  '/:eventId/zoom',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.params.eventId;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }

    // Return rentang tanggal event untuk Gantt
    return res.json({
      data: {
        eventStart: event.startDate.toISOString().slice(0, 10),
        eventEnd: event.endDate?.toISOString().slice(0, 10) || event.startDate.toISOString().slice(0, 10),
        now: new Date().toISOString().slice(0, 10),
      },
    });
  })
);
