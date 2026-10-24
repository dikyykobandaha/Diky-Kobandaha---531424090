import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { createScheduleService } from '../services/schedule.js';

const scheduleService = createScheduleService(prisma);

export const router = Router();

// Common CSV helper
function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function encodeCSV(rows: string[][]): string {
  return rows
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');
}

// GET /api/csv/tasks?eventId=...&organizationId=... — ekspor CSV tugas
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
      return res.status(200).set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=tugas.csv' }).send(encodeCSV([['No tasks found']]));
    }

    const tasks = await prisma.task.findMany({
      where: { eventId: { in: eventIds } },
      include: {
        event: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        taskMembers: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const rows: string[][] = [
      [
        'ID Tugas',
        'Judul',
        'Acara',
        'Tanggal Mulai',
        'Tanggal Selesai',
        'Durasi (hari kerja)',
        'Prioritas',
        'Status',
        'Progres (%)',
        'Milestone',
        'Penanggung Jawab',
        'Anggota Ditugaskan',
        'Biaya Estimasi',
      ],
    ];

    for (const t of tasks) {
      const assigneeIds = (t.assigneeIds ? JSON.parse(t.assigneeIds) : []) as string[];
      const memberIds = t.taskMembers.map((m) => m.userId);
      const allIds = [...new Set([t.assigneeId, ...assigneeIds, ...memberIds])].filter(Boolean);
      const allNames = allIds
        .map((id) => {
          if (id === t.assigneeId) return t.assignee?.name;
          const member = t.taskMembers.find((m) => m.userId === id);
          return member?.user.name;
          // fallback juga bisa lookup user lain tapi cukup yang ada
        })
        .filter((n): n is string => !!n);

      rows.push([
        t.id,
        t.title,
        t.event.name,
        t.startDate?.toISOString().slice(0, 10) || '',
        t.endDate?.toISOString().slice(0, 10) || '',
        String(t.durationDays),
        t.priority,
        t.status,
        String(t.progress),
        t.isMilestone ? 'Ya' : 'Tidak',
        t.assignee?.name || '',
        allNames.join('; '),
        t.estimatedCost != null ? String(t.estimatedCost) : '',
      ]);
    }

    const csv = encodeCSV(rows);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${eventId || 'tugas'}.csv"`,
    });
    res.send(csv);
  })
);

// GET /api/csv/members?organizationId=... — ekspor CSV anggota organisasi
router.get(
  '/members',
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
      include: {
        user: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'desc' }],
    });

    const rows: string[][] = [
      [
        'ID Anggota',
        'Nama',
        'Email',
        'Organisasi',
        'Peran',
        'Bergabung',
      ],
    ];

    for (const m of members) {
      rows.push([
        m.id,
        m.user.name,
        m.user.email,
        m.organization.name,
        m.role,
        m.joinedAt.toISOString().slice(0, 10),
      ]);
    }

    const csv = encodeCSV(rows);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="anggota-${organizationId}.csv"`,
    });
    res.send(csv);
  })
);

// GET /api/csv/schedule?eventId=... — ekspor CSV jadwal Gantt
router.get(
  '/schedule',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.query.eventId as string | undefined;
    if (!eventId) {
      return next(badRequest('eventId wajib disediakan.'));
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organization: { include: { workCalendars: true } } },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke acara ini.'));
    }

    // Dapatkan data jadwal
    const schedule = await scheduleService.computeEventSchedule(eventId);

    const tasks = await prisma.task.findMany({
      where: { eventId },
      orderBy: [{ isMilestone: 'desc' }, { startDate: 'asc' }],
    });

    const dependencies = await prisma.taskDependency.findMany({
      where: { taskId: { in: tasks.map((t) => t.id) } },
    });

    const rows: string[][] = [
      [
        'ID Tugas',
        'Judul',
        'Milestone',
        'Prioritas',
        'Status',
        'Progres (%)',
        'Durasi (hari kerja)',
        'Tanggal Mulai (jadwal)',
        'Tanggal Selesai (jadwal)',
        'ES (indeks)',
        'EF (indeks)',
        'LS (indeks)',
        'LF (indeks)',
        'Float (hari kerja)',
        'Kritis',
        'Dependensi',
      ],
    ];

    const cpmMap = new Map<string, any>();
    for (const [taskId, s] of schedule.entries()) {
      cpmMap.set(taskId, s);
    }

    // Hitung CPM sederhana untuk float & critical (gunakan data schedule sederhana)
    // Untuk float: LF - EF, dengan LF = project duration
    const projectDuration = Math.max(0, ...Array.from(schedule.values()).map((s) => s.earliestFinishWorkDay));

    for (const t of tasks) {
      const sched = cpmMap.get(t.id);
      const es = sched?.earliestStartWorkDay ?? 0;
      const ef = sched?.earliestFinishWorkDay ?? 0;
      const float = projectDuration - ef; // sederhana, bukan backward pass penuh
      const isCritical = float <= 0.5;

      const deps = dependencies
        .filter((d) => d.taskId === t.id)
        .map((d) => d.predecessorId)
        .join('; ');

      rows.push([
        t.id,
        t.title,
        t.isMilestone ? 'Ya' : 'Tidak',
        t.priority,
        t.status,
        String(t.progress),
        String(t.durationDays),
        sched?.earliestStartDate || '',
        sched?.earliestEndDate || '',
        String(es),
        String(ef),
        String(sched?.earliestStartWorkDay ?? ''),
        String(sched?.earliestFinishWorkDay ?? ''),
        String(float),
        isCritical ? 'Ya' : 'Tidak',
        deps || '',
      ]);
    }

    const csv = encodeCSV(rows);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="jadwal-${eventId}.csv"`,
    });
    res.send(csv);
  })
);

// GET /api/csv/project-summary?eventId=... — ekspor CSV ringkasan proyek
router.get(
  '/project-summary',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.query.eventId as string | undefined;
    if (!eventId) {
      return next(badRequest('eventId wajib disediakan.'));
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organization: { include: { workCalendars: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke acara ini.'));
    }

    const tasks = await prisma.task.findMany({
      where: { eventId },
      select: {
        id: true,
        title: true,
        durationDays: true,
        status: true,
        progress: true,
        isMilestone: true,
      },
    });

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const progressSum = tasks.reduce((sum, t) => sum + t.progress, 0);
    const overallProgress = totalTasks > 0 ? Math.round(progressSum / totalTasks) : 0;

    const milestoneCount = tasks.filter((t) => t.isMilestone).length;
    const totalDurationDays = tasks.reduce((sum, t) => sum + t.durationDays, 0);

    const rows: string[][] = [
      ['Ringkasan Proyek'],
      ['Nama Acara', event.name],
      ['Organisasi', event.organization.name],
      ['Status Acara', event.status],
      ['Pemilik', event.owner.name],
      ['Tanggal Mulai Acara', event.startDate.toISOString().slice(0, 10)],
      ['Tanggal Selesai Acara', event.endDate?.toISOString().slice(0, 10) || ''],
      [''],
      ['Metrik'],
      ['Total Tugas', String(totalTasks)],
      ['Tugas Selesai', String(doneTasks)],
      ['Tugas Belum Selesai', String(totalTasks - doneTasks)],
      ['Milestone', String(milestoneCount)],
      ['Total Durasi (hari kerja)', String(totalDurationDays)],
      ['Progres Keseluruhan (%)', String(overallProgress)],
      [''],
      ['Daftar Tugas'],
      ['ID', 'Judul', 'Durasi (hari kerja)', 'Status', 'Progres (%)', 'Milestone'],
    ];

    for (const t of tasks) {
      rows.push([
        t.id,
        t.title,
        String(t.durationDays),
        t.status,
        String(t.progress),
        t.isMilestone ? 'Ya' : 'Tidak',
      ]);
    }

    const csv = encodeCSV(rows);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ringkasan-${eventId}.csv"`,
    });
    res.send(csv);
  })
);
