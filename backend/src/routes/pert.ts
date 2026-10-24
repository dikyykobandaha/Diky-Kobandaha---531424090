import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { computeCpm, topologicalOrder } from '../services/cpm.js';
import { createScheduleService } from '../services/schedule.js';

const scheduleService = createScheduleService(prisma);

export const router = Router();

// GET /api/pert/:eventId — data PERT Network Diagram
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
      include: {
        assignee: { select: { id: true, name: true } },
        _count: { select: { children: true } },
      },
      orderBy: [{ isMilestone: 'desc' }, { startDate: 'asc' }],
    });

    const dependencies = await prisma.taskDependency.findMany({
      where: { taskId: { in: tasks.map((t) => t.id) } },
      include: {
        task: { select: { id: true, title: true } },
        predecessor: { select: { id: true, title: true } },
      },
    });

    let cpmResult = null;
    let cpmTasks: ReturnType<typeof computeCpm>['tasks'] = [];
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

      cpmTasks = cpmResult.tasks;
    }

    // Build node & edge untuk frontend
    const nodes = tasks.map((t) => {
      const cpmTask = cpmTasks.find((c) => c.id === t.id);
      return {
        id: t.id,
        title: t.title,
        duration: t.durationDays,
        isMilestone: t.isMilestone,
        priority: t.priority,
        status: t.status,
        progress: t.progress,
        assignee: t.assignee,
        startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
        endDate: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
        durationWorkDays: t.durationDays,
        // CPM
        es: cpmTask?.earliestStartWorkDay ?? null,
        ef: cpmTask?.earliestFinishWorkDay ?? null,
        ls: cpmTask?.latestStartWorkDay ?? null,
        lf: cpmTask?.latestFinishWorkDay ?? null,
        float: cpmTask?.floatWorkDays ?? null,
        isCritical: cpmTask?.isCritical ?? false,
      };
    });

    const edges = dependencies.map((d) => ({
      id: d.id,
      from: d.predecessorId,
      to: d.taskId,
      type: d.type,
      lagWorkDays: d.lagWorkDays,
      fromTitle: d.predecessor.title,
      toTitle: d.task.title,
    }));

    // Urutan topologi untuk layout (bila frontend butuh)
    const topoOrder = tasks.length > 0
      ? topologicalOrder(
          tasks.map((t) => ({
            id: t.id,
            title: t.title,
            durationWorkDays: t.durationDays,
            isMilestone: t.isMilestone,
            startDate: t.startDate?.toISOString().slice(0, 10) || null,
            endDate: t.endDate?.toISOString().slice(0, 10) || null,
          })),
          dependencies.map((d) => ({
            from: d.predecessorId,
            to: d.taskId,
            type: d.type as any,
            lagWorkDays: d.lagWorkDays,
          }))
        )
      : [];

    return res.json({
      data: {
        event: {
          id: event.id,
          name: event.name,
        },
        nodes,
        edges,
        topologicalOrder: topoOrder,
        cpm: cpmResult
          ? {
              projectDurationWorkDays: cpmResult.projectDurationWorkDays,
              criticalTaskIds: cpmResult.criticalTaskIds,
              criticalPaths: cpmResult.criticalPaths,
              isolatedTaskIds: cpmResult.isolatedTaskIds,
              errors: cpmResult.errors,
            }
          : null,
        taskCount: tasks.length,
        isEmpty: tasks.length === 0,
      },
    });
  })
);

// GET /api/pert/:eventId/node/:taskId — detail node PERT (tugas) dengan dependensi
router.get(
  '/:eventId/node/:taskId',
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
      include: {
        assignee: { select: { id: true, name: true } },
        _count: { select: { children: true } },
      },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const predecessors = await prisma.taskDependency.findMany({
      where: { taskId },
      include: {
        predecessor: { select: { id: true, title: true, startDate: true, endDate: true } },
      },
    });

    const successors = await prisma.taskDependency.findMany({
      where: { predecessorId: taskId },
      include: {
        task: { select: { id: true, title: true, startDate: true, endDate: true } },
      },
    });

    return res.json({
      data: {
        id: task.id,
        title: task.title,
        description: task.description,
        eventId: task.eventId,
        startDate: task.startDate?.toISOString().slice(0, 10) || null,
        endDate: task.endDate?.toISOString().slice(0, 10) || null,
        durationDays: task.durationDays,
        priority: task.priority,
        status: task.status,
        progress: task.progress,
        isMilestone: task.isMilestone,
        assignee: task.assignee,
        childrenCount: task._count.children,
        predecessors: predecessors.map((p) => ({
          id: p.id,
          predecessorId: p.predecessorId,
          predecessorTitle: p.predecessor.title,
          type: p.type,
          lagWorkDays: p.lagWorkDays,
          startDate: p.predecessor.startDate?.toISOString().slice(0, 10) || null,
          endDate: p.predecessor.endDate?.toISOString().slice(0, 10) || null,
        })),
        successors: successors.map((s) => ({
          id: s.id,
          taskId: s.taskId,
          taskTitle: s.task.title,
          type: s.type,
          lagWorkDays: s.lagWorkDays,
          startDate: s.task.startDate?.toISOString().slice(0, 10) || null,
          endDate: s.task.endDate?.toISOString().slice(0, 10) || null,
        })),
      },
    });
  })
);
