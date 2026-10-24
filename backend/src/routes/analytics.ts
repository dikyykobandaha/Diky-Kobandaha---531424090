import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { computeCpm } from '../services/cpm.js';

export const router = Router();

// GET /api/analytics/summary — ringkasan dashboard lengkap (per organisasi atau per acara)
router.get(
  '/summary',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const organizationId = req.query.organizationId as string | undefined;
    const eventId = req.query.eventId as string | undefined;

    let orgId: string | null = organizationId ?? null;
    if (!orgId) {
      // Gunakan organisasi default user
      const memberships = await prisma.organizationMembership.findMany({
        where: { userId: user.id },
        orderBy: [{ role: 'asc' }],
      });
      const priority = (r: string | null) => {
        if (r === 'owner') return 0;
        if (r === 'admin') return 1;
        if (r === 'member') return 2;
        return 3;
      };
      memberships.sort((a, b) => priority(a.role) - priority(b.role));
      if (memberships.length > 0) {
        orgId = memberships[0].organizationId;
      }
    }
    if (!orgId) {
      return next(badRequest('Tidak ada organisasi yang dapat diakses.'));
    }

    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const now = new Date();

    // Acara statistik
    const eventStats = await prisma.event.aggregate({
      where: { organizationId: orgId },
      _count: true,
    });

    const eventList = await prisma.event.findMany({
      where: { organizationId: orgId },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        _count: { select: { tasks: true } },
      },
    });

    const upcomingEventCount = eventList.filter(
      (e) => e.startDate >= now && e.status !== 'cancelled' && e.status !== 'finished'
    ).length;
    const runningEventCount = eventList.filter(
      (e) => e.status === 'running' && (e.endDate === null || e.endDate >= now)
    ).length;

    // Tugas statistik
    const eventIds = eventList.map((e) => e.id);
    const taskStats = await prisma.task.aggregate({
      where: { eventId: { in: eventIds } },
      _count: true,
      _sum: { progress: true },
    });

    const taskByStatus = await prisma.task.groupBy({
      by: ['status'],
      where: { eventId: { in: eventIds } },
      _count: true,
    });

    const statusCount: Record<string, number> = {};
    for (const g of taskByStatus) {
      statusCount[g.status] = g._count;
    }

    const taskCount = taskStats._count;
    const notStartedCount = statusCount['not_started'] || 0;
    const inProgressCount = statusCount['in_progress'] || 0;
    const doneCount = statusCount['done'] || 0;
    const delayedCount = statusCount['delayed'] || 0;
    const cancelledCount = statusCount['cancelled'] || 0;

    const overallProgress =
      taskCount > 0 ? Math.round((taskStats._sum.progress || 0) / taskCount) : 0;

    // Milestone mendatang
    const upcomingMilestones = await prisma.task.findMany({
      where: {
        eventId: { in: eventIds },
        isMilestone: true,
        startDate: { gte: now },
        status: { notIn: ['done', 'cancelled'] },
      },
      include: {
        event: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 10,
    });

    // Aktivitas terbaru
    const recentActivity = await prisma.activity.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    // Beban kerja anggota
    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'desc' }],
    });

    const workload = await Promise.all(
      members.map(async (m) => {
        const tasks = await prisma.task.findMany({
          where: {
            eventId: { in: eventIds },
            OR: [
              { assigneeId: m.userId },
              { assigneeIds: { contains: JSON.stringify([m.userId]) } },
              { taskMembers: { some: { userId: m.userId } } },
            ],
          },
          select: {
            id: true,
            status: true,
            endDate: true,
          },
        });

        const assignedCount = tasks.length;
        const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
        const overdue = tasks.filter((t) => {
          if (t.status === 'done' || t.status === 'cancelled') return false;
          if (t.endDate) {
            const end = new Date(t.endDate);
            if (end < now) return true;
          }
          return false;
        }).length;

        return {
          member: {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
          },
          role: m.role,
          assignedCount,
          inProgressCount: inProgress,
          overdueCount: overdue,
        };
      })
    );

    return res.json({
      data: {
        organizationId: orgId,
        eventCount: eventList.length,
        upcomingEventCount,
        runningEventCount,
        taskCount,
        notStartedTaskCount: notStartedCount,
        inProgressTaskCount: inProgressCount,
        doneTaskCount: doneCount,
        delayedTaskCount: delayedCount,
        cancelledTaskCount: cancelledCount,
        overallProgress,
        upcomingMilestones: upcomingMilestones.map((m) => ({
          id: m.id,
          title: m.title,
          eventId: m.event.id,
          eventName: m.event.name,
          dueDate: m.startDate?.toISOString().slice(0, 10) || null,
        })),
        recentActivity: recentActivity.map((a) => ({
          id: a.id,
          type: a.type,
          description: a.description,
          entityId: a.entityId,
          entityName: a.entityName,
          createdAt: a.createdAt.toISOString(),
          user: a.user ? { id: a.user.id, name: a.user.name } : null,
        })),
        memberWorkload: workload,
      },
    });
  })
);

// GET /api/analytics/tasks — statistik tugas per status & prioritas
router.get(
  '/tasks',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const organizationId = req.query.organizationId as string | undefined;
    const eventId = req.query.eventId as string | undefined;

    let orgId: string | null = organizationId ?? null;
    if (!orgId) {
      const memberships = await prisma.organizationMembership.findMany({
        where: { userId: user.id },
        orderBy: [{ role: 'asc' }],
      });
      const priority = (r: string | null) => {
        if (r === 'owner') return 0;
        if (r === 'admin') return 1;
        if (r === 'member') return 2;
        return 3;
      };
      memberships.sort((a, b) => priority(a.role) - priority(b.role));
      if (memberships.length > 0) {
        orgId = memberships[0].organizationId;
      }
    }
    if (!orgId) {
      return next(badRequest('Tidak ada organisasi yang dapat diakses.'));
    }

    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    let eventIds: string[] = [];
    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event || event.organizationId !== orgId) {
        return next(notFound('Acara tidak ditemukan.'));
      }
      eventIds = [eventId];
    } else {
      const events = await prisma.event.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      eventIds = events.map((e) => e.id);
    }

    if (eventIds.length === 0) {
      return res.json({ data: { tasks: [], statusDistribution: {}, priorityDistribution: {} } });
    }

    const [tasks, statusDist, priorityDist] = await Promise.all([
      prisma.task.findMany({
        where: { eventId: { in: eventIds } },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: { eventId: { in: eventIds } },
        _count: true,
      }),
      prisma.task.groupBy({
        by: ['priority'],
        where: { eventId: { in: eventIds } },
        _count: true,
      }),
    ]);

    const statusDistribution: Record<string, number> = {};
    for (const g of statusDist) {
      statusDistribution[g.status] = g._count;
    }
    const priorityDistribution: Record<string, number> = {};
    for (const g of priorityDist) {
      priorityDistribution[g.priority] = g._count;
    }

    // Tugas terlambat
    const now = new Date();
    const overdueTasks = tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'cancelled') return false;
      return t.endDate && new Date(t.endDate) < now;
    });

    return res.json({
      data: {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          eventId: t.eventId,
          startDate: t.startDate?.toISOString().slice(0, 10) || null,
          endDate: t.endDate?.toISOString().slice(0, 10) || null,
          durationDays: t.durationDays,
          priority: t.priority,
          status: t.status,
          progress: t.progress,
          isMilestone: t.isMilestone,
        })),
        statusDistribution,
        priorityDistribution,
        overdueCount: overdueTasks.length,
        overdueTasks: overdueTasks.slice(0, 20).map((t) => ({
          id: t.id,
          title: t.title,
          eventId: t.eventId,
          endDate: t.endDate?.toISOString().slice(0, 10) || null,
          status: t.status,
        })),
        totalCount: tasks.length,
      },
    });
  })
);

// GET /api/analytics/milestones — milestone mendatang
router.get(
  '/milestones',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const organizationId = req.query.organizationId as string | undefined;
    const eventId = req.query.eventId as string | undefined;

    let orgId: string | null = organizationId ?? null;
    if (!orgId) {
      const memberships = await prisma.organizationMembership.findMany({
        where: { userId: user.id },
        orderBy: [{ role: 'asc' }],
      });
      const priority = (r: string | null) => {
        if (r === 'owner') return 0;
        if (r === 'admin') return 1;
        if (r === 'member') return 2;
        return 3;
      };
      memberships.sort((a, b) => priority(a.role) - priority(b.role));
      if (memberships.length > 0) {
        orgId = memberships[0].organizationId;
      }
    }
    if (!orgId) {
      return next(badRequest('Tidak ada organisasi yang dapat diakses.'));
    }

    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    let eventIds: string[] = [];
    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event || event.organizationId !== orgId) {
        return next(notFound('Acara tidak ditemukan.'));
      }
      eventIds = [eventId];
    } else {
      const events = await prisma.event.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      eventIds = events.map((e) => e.id);
    }

    const now = new Date();
    const milestones = await prisma.task.findMany({
      where: {
        eventId: { in: eventIds },
        isMilestone: true,
        startDate: { gte: now },
        status: { notIn: ['done', 'cancelled'] },
      },
      include: {
        event: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    return res.json({
      data: milestones.map((m) => ({
        id: m.id,
        title: m.title,
        eventId: m.event.id,
        eventName: m.event.name,
        dueDate: m.startDate?.toISOString().slice(0, 10) || null,
        assignee: m.assignee,
        status: m.status,
        progress: m.progress,
      })),
    });
  })
);

// GET /api/analytics/member-workload — beban kerja semua anggota organisasi
router.get(
  '/member-workload',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const organizationId = req.query.organizationId as string | undefined;
    if (!organizationId) {
      return next(badRequest('organizationId wajib disediakan.'));
    }

    const access = await requireOrgAccess(prisma, user.id, organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const members = await prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'desc' }],
    });

    const now = new Date();

    const workload = await Promise.all(
      members.map(async (m) => {
        const tasks = await prisma.task.findMany({
          where: {
            OR: [
              { assigneeId: m.userId },
              { assigneeIds: { contains: JSON.stringify([m.userId]) } },
              { taskMembers: { some: { userId: m.userId } } },
            ],
          },
          select: {
            id: true,
            status: true,
            endDate: true,
            event: { select: { id: true, name: true } },
          },
        });

        const assignedCount = tasks.length;
        const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
        const overdue = tasks.filter((t) => {
          if (t.status === 'done' || t.status === 'cancelled') return false;
          if (t.endDate) {
            const end = new Date(t.endDate);
            if (end < now) return true;
          }
          return false;
        }).length;
        const notStarted = tasks.filter((t) => t.status === 'not_started').length;
        const done = tasks.filter((t) => t.status === 'done').length;
        const doneCount = done;

        return {
          member: {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
          },
          role: m.role,
          assignedCount,
          inProgressCount: inProgress,
          overdueCount: overdue,
          notStartedCount: notStarted,
          doneCount,
        };
      })
    );

    return res.json({ data: workload });
  })
);

// ===================== Rute gabungan untuk halaman Analytics (frontend) =====================

// GET /api/analytics?eventId=... — data agregat untuk halaman analitik
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.query.eventId as string | undefined;
    const requestedOrgId = req.query.organizationId as string | undefined;
    if (!eventId && !requestedOrgId) {
      return next(badRequest('eventId atau organizationId wajib disediakan.'));
    }

    let organizationId: string;
    let workingDays: number[] = [1, 2, 3, 4, 5];
    let taskWhere: { eventId: string } | { event: { organizationId: string } };

    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { organization: { include: { workCalendars: true } } },
      });
      if (!event) return next(notFound('Acara tidak ditemukan.'));
      organizationId = event.organizationId;
      const eventCalendar = event.organization.workCalendars[0];
      if (eventCalendar) workingDays = JSON.parse(eventCalendar.workingDays) as number[];
      taskWhere = { eventId };
    } else {
      organizationId = requestedOrgId as string;
      const orgCalendar = await prisma.workCalendar.findFirst({ where: { organizationId } });
      if (orgCalendar) workingDays = JSON.parse(orgCalendar.workingDays) as number[];
      taskWhere = { event: { organizationId } };
    }

    const access = await requireOrgAccess(prisma, user.id, organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }

    const now = new Date();
    const tasks = await prisma.task.findMany({
      where: taskWhere,
      include: {
        event: { select: { id: true, name: true } },
        taskMembers: { select: { userId: true } },
      },
      orderBy: [{ isMilestone: 'desc' }, { startDate: 'asc' }],
    });

    // Ringkasan tugas
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const notStartedTasks = tasks.filter((t) => t.status === 'not_started').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
    const delayedTasks = tasks.filter((t) => t.status === 'delayed').length;
    const cancelledTasks = tasks.filter((t) => t.status === 'cancelled').length;
    const averageProgress = totalTasks > 0 ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / totalTasks) : 0;

    // Persebaran status & prioritas
    const statusDistribution: Record<string, number> = {};
    const priorityDistribution: Record<string, number> = {};
    for (const t of tasks) {
      statusDistribution[t.status] = (statusDistribution[t.status] || 0) + 1;
      priorityDistribution[t.priority] = (priorityDistribution[t.priority] || 0) + 1;
    }

    // Milestone
    const milestones = tasks
      .filter((t) => t.isMilestone)
      .map((t) => ({ id: t.id, title: t.title, startDate: t.startDate?.toISOString() ?? null }));

    // Beban kerja anggota (berdasarkan penugasan tugas pada event ini)
    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true } } },
    });
    const assigneeWorkload = memberships.map((m) => {
      const memberTasks = tasks.filter(
        (t) =>
          t.assigneeId === m.userId ||
          (typeof t.assigneeIds === 'string'
            ? (JSON.parse(t.assigneeIds || '[]') as string[]).includes(m.userId)
            : false)
      );
      const total = memberTasks.length;
      const active = memberTasks.filter((t) => t.status === 'in_progress' || t.status === 'delayed').length;
      const done = memberTasks.filter((t) => t.status === 'done').length;
      const workloadPercent = total > 0 ? Math.round(((active / total) * 100) || 0) : 0;
      return {
        id: m.userId,
        name: m.user.name,
        activeTaskCount: active,
        doneTaskCount: done,
        totalTaskCount: total,
        workloadPercent,
      };
    }).filter((w) => w.totalTaskCount > 0).sort((a, b) => b.activeTaskCount - a.activeTaskCount);

    // Tugas perlu perhatian: delayed, overdue, atau berprioritas urgennya belum selesai
    const tasksNeedingAttention = tasks
      .filter((t) => {
        if (t.status === 'done' || t.status === 'cancelled') return false;
        if (t.status === 'delayed') return true;
        if (t.priority === 'urgent' && t.status !== 'done') return true;
        const end = t.endDate ? new Date(t.endDate) : null;
        if (end && end < now) return true;
        return false;
      })
      .slice(0, 10)
      .map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, progress: t.progress }));

    // Jalur kritis via CPM (jika ada tugas berdurasi)
    let criticalPath: Array<{ id: string; title: string; earliestStart: string | null; earliestFinish: string | null; totalFloat: number | null }> = [];
    try {
      const durationWorkDays = (n: { durationDays: number }) => Math.max(0, n.durationDays);
      if (tasks.some((t) => durationWorkDays(t) > 0)) {
        const deps = await prisma.taskDependency.findMany({ where: { taskId: { in: tasks.map((t) => t.id) } } });
        const cpm = computeCpm(
          tasks.map((t) => ({
            id: t.id,
            title: t.title,
            durationWorkDays: durationWorkDays(t),
            isMilestone: t.isMilestone,
            startDate: t.startDate?.toISOString().slice(0, 10) ?? null,
            endDate: (t as any).endDate?.toISOString().slice(0, 10) ?? null,
          })),
          deps.map((d) => ({ from: d.predecessorId, to: d.taskId, type: d.type as any, lagWorkDays: d.lagWorkDays })),
          { byDayOfWeek: workingDays.map((d) => d === 1 || d === 2 || d === 3 || d === 4 || d === 5) }
        );
        const taskTitleById = new Map(tasks.map((t) => [t.id, t.title]));
        criticalPath = cpm.criticalTaskIds
          .map((id) => cpm.tasks.find((r) => r.id === id))
          .filter((r): r is NonNullable<typeof r> => !!r)
          .map((r) => ({
            id: r.id,
            title: taskTitleById.get(r.id) ?? r.title,
            earliestStart: (r as any).earliestStartDate ?? null,
            earliestFinish: (r as any).earliestFinishDate ?? null,
            totalFloat: r.floatWorkDays,
          }));
      }
    } catch {
      criticalPath = [];
    }

    return res.json({
      data: {
        summary: {
          totalTasks,
          doneTasks,
          notStartedTasks,
          inProgressTasks,
          delayedTasks,
          cancelledTasks,
          averageProgress,
        },
        projectProgress: averageProgress,
        taskDistribution: {
          status: statusDistribution,
          priority: priorityDistribution,
        },
        milestones,
        tasksNeedingAttention,
        assigneeWorkload,
        criticalPath,
      },
    });
  })
);

// GET /api/analytics/csv?eventId=... — unduh ringkasan analitik sebagai CSV
router.get(
  '/csv',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.query.eventId as string | undefined;
    const requestedOrgId = req.query.organizationId as string | undefined;
    if (!eventId && !requestedOrgId) {
      return next(badRequest('eventId atau organizationId wajib disediakan.'));
    }

    let organizationId: string;
    let taskWhere: { eventId: string } | { event: { organizationId: string } };
    if (eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) return next(notFound('Acara tidak ditemukan.'));
      organizationId = event.organizationId;
      taskWhere = { eventId };
    } else {
      organizationId = requestedOrgId as string;
      taskWhere = { event: { organizationId } };
    }

    const access = await requireOrgAccess(prisma, user.id, organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }

    const tasks = await prisma.task.findMany({
      where: taskWhere,
      orderBy: [{ isMilestone: 'desc' }, { startDate: 'asc' }],
    });

    const rows: string[] = [];
    rows.push('Tipe,Judul,Tanggal Mulai,Tanggal Selesai,Durasi,Prioritas,Status,Progres (%)');
    for (const t of tasks) {
      const fields = [
        t.isMilestone ? 'Milestone' : 'Tugas',
        t.title,
        t.startDate?.toISOString().slice(0, 10) ?? '',
        t.endDate?.toISOString().slice(0, 10) ?? '',
        String(t.durationDays),
        t.priority,
        t.status,
        String(t.progress),
      ].map((v) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v));
      rows.push(fields.join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="eventflow_analytics_${eventId ?? organizationId}.csv"`
    );
    return res.send(rows.join('\r\n'));
  })
);
