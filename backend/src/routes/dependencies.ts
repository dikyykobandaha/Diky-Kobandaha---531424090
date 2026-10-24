import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { hasCycle } from '../services/cpm.js';
import { createScheduleService } from '../services/schedule.js';

const scheduleService = createScheduleService(prisma);

export const router = Router();

// GET /api/dependencies?taskId=... — daftar dependensi
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const taskId = req.query.taskId as string | undefined;
    const eventId = req.query.eventId as string | undefined;

    if (!eventId && !taskId) {
      return next(badRequest('eventId atau taskId wajib disediakan.'));
    }

    let eventOrgId: string | null = null;
    if (eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) return next(notFound('Acara tidak ditemukan.'));
      eventOrgId = event.organizationId;
      const access = await requireOrgAccess(prisma, user.id, eventOrgId);
      if (!access.allowed) {
        return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
      }
    }

    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { event: true },
      });
      if (!task) return next(notFound('Tugas tidak ditemukan.'));
      if (eventOrgId && eventOrgId !== task.event.organizationId) {
        return next(badRequest('id tidak konsisten.'));
      }
      eventOrgId = task.event.organizationId;
      const access = await requireOrgAccess(prisma, user.id, eventOrgId);
      if (!access.allowed) {
        return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
      }
    }

    if (!eventOrgId) return next(badRequest('Data tidak valid.'));

    const where: any = { taskId };
    if (eventId) where.task = { eventId };

    const deps = await prisma.taskDependency.findMany({
      where,
      include: {
        task: { select: { id: true, title: true } },
        predecessor: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ data: deps.map((d) => ({
      id: d.id,
      taskId: d.taskId,
      taskTitle: d.task.title,
      predecessorId: d.predecessorId,
      predecessorTitle: d.predecessor.title,
      type: d.type,
      lagWorkDays: d.lagWorkDays,
      createdAt: d.createdAt.toISOString(),
    }))});
  })
);

// POST /api/dependencies — buat dependensi
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { taskId, predecessorId, type, lagWorkDays, eventId } = req.body as {
      taskId: string;
      predecessorId: string;
      type?: 'FS' | 'SS';
      lagWorkDays?: number;
      eventId?: string;
    };

    if (!taskId || !predecessorId) {
      return next(badRequest('taskId dan predecessorId wajib diisi.'));
    }
    if (taskId === predecessorId) {
      return next(badRequest('Tugas tidak boleh bergantung pada dirinya sendiri.'));
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { event: { include: { organization: true } } },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));
    const access = await requireOrgAccess(prisma, user.id, task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat membuat dependensi.'));
    }

    // Cek predecessor ada di acara yang sama
    const predecessor = await prisma.task.findUnique({
      where: { id: predecessorId, eventId: task.eventId },
    });
    if (!predecessor) {
      return next(badRequest('Tugas pendahulu tidak ditemukan di acara ini.'));
    }

    const deps: any = { taskId, predecessorId };
    if (type && (type === 'FS' || type === 'SS')) deps.type = type;
    if (lagWorkDays != null) deps.lagWorkDays = Math.max(0, parseInt(String(lagWorkDays), 10) || 0);

    // Cek duplikat
    const existing = await prisma.taskDependency.findUnique({
      where: {
        taskId_predecessorId_type: {
          taskId,
          predecessorId,
          type: deps.type || 'FS',
        },
      },
    });
    if (existing) {
      return next(badRequest('Dependensi ini sudah ada.'));
    }

    // Cek siklus: buat sementara, cek, kalau ada siklus batalkan (rollback)
    // Kita cek dengan graph sementara
    const allDeps = await prisma.taskDependency.findMany({
      where: { OR: [{ taskId }, { predecessorId }] },
      include: { task: true, predecessor: true },
    });
    // Build graph sementara dengan dependensi baru
    const graphEdges = allDeps
      .filter((d) => d.taskId !== d.predecessorId)
      .map((d) => ({ from: d.predecessorId, to: d.taskId, type: d.type as any, lagWorkDays: d.lagWorkDays }));
    // Masukkan dependensi baru ke grafnya
    graphEdges.push({ from: predecessorId, to: taskId, type: deps.type || 'FS', lagWorkDays: deps.lagWorkDays || 0 });

    const tasksInGraph = await prisma.task.findMany({
      where: {
        id: {
          in: [
            ...new Set([
              ...graphEdges.map((e) => e.from),
              ...graphEdges.map((e) => e.to),
            ]),
          ],
        },
      },
      select: { id: true, title: true },
    });

    const taskNodes = tasksInGraph.map((t) => ({
      id: t.id,
      title: t.title,
      durationWorkDays: 0, // tidak digunakan untuk deteksi siklus
      isMilestone: false,
    }));

    const graph = {
      nodes: new Map(taskNodes.map((t) => [t.id, t])),
      edges: graphEdges,
    };

    if (hasCycle(graph)) {
      return next(badRequest('Menambahkan dependensi ini akan menyebabkan siklus. Mohon hapus dependensi lain terlebih dahulu.'));
    }

    const dep = await prisma.taskDependency.create({
      data: deps,
      include: {
        task: { select: { id: true, title: true } },
        predecessor: { select: { id: true, title: true } },
      },
    });

    // Recalculate jadwal event
    await scheduleService.applyScheduleToTasks(task.eventId);

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: task.event.organizationId,
        type: 'dependency_created',
        description: `Menambahkan dependensi dari "${predecessor.title}" ke "${task.title}" (${deps.type || 'FS'}, lag ${deps.lagWorkDays || 0} hari kerja).`,
        entityId: dep.id,
        entityName: `${predecessor.title} → ${task.title}`,
      },
    });

    return res.status(201).json({ data: dep, message: 'Dependensi berhasil dibuat.' });
  })
);

// DELETE /api/dependencies/:id — hapus dependensi
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const dep = await prisma.taskDependency.findUnique({
      where: { id: req.params.id },
      include: {
        task: { include: { event: { include: { organization: true } } } },
        predecessor: true,
      },
    });
    if (!dep) return next(notFound('Dependensi tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, dep.task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat menghapus dependensi.'));
    }

    await prisma.taskDependency.delete({ where: { id: req.params.id } });

    // Recalculate jadwal event
    await scheduleService.applyScheduleToTasks(dep.task.eventId);

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: dep.task.event.organizationId,
        type: 'dependency_deleted',
        description: `Menghapus dependensi dari "${dep.predecessor.title}" ke "${dep.task.title}".`,
        entityId: dep.id,
        entityName: `${dep.predecessor.title} → ${dep.task.title}`,
      },
    });

    return res.json({ message: 'Dependensi berhasil dihapus.' });
  })
);

// POST /api/dependencies/recalculate — hitung ulang jadwal semua tugas dalam event
router.post(
  '/recalculate',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { eventId } = req.body as { eventId?: string };
    if (!eventId) {
      return next(badRequest('eventId wajib diisi.'));
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { organization: true },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));
    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat menghitung ulang jadwal.'));
    }

    const result = await scheduleService.applyScheduleToTasks(eventId);

    return res.json({
      message: `Jadwal berhasil dihitung ulang. ${result.updated} tugas diperbarui.`,
      data: {
        updated: result.updated,
        results: result.results.map((r) => ({
          taskId: r.taskId,
          earliestStartDate: r.earliestStartDate,
          earliestEndDate: r.earliestEndDate,
          startDateConstraint: r.startDateConstraint,
        })),
      },
    });
  })
);

// GET /api/dependencies/check-cycle?taskId=... — cek apakah penambahan dependensi tertentu menyebabkan siklus (pre-flight)
router.get(
  '/check-cycle',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { taskId, predecessorId } = req.query as { taskId?: string; predecessorId?: string };
    if (!taskId || !predecessorId) {
      return next(badRequest('taskId dan predecessorId wajib disediakan.'));
    }
    if (taskId === predecessorId) {
      return next(badRequest('Tugas tidak boleh bergantung pada dirinya sendiri.'));
    }

    // Build graph sementara
    const allDeps = await prisma.taskDependency.findMany({
      where: { OR: [{ taskId }, { predecessorId }] },
    });
    const graphEdges = allDeps
      .filter((d) => d.taskId !== d.predecessorId)
      .map((d) => ({ from: d.predecessorId, to: d.taskId, type: d.type as any, lagWorkDays: d.lagWorkDays }));

    graphEdges.push({ from: predecessorId, to: taskId, type: 'FS', lagWorkDays: 0 });

    const allTaskIds = new Set([
      ...graphEdges.map((e) => e.from),
      ...graphEdges.map((e) => e.to),
    ]);
    const tasks = await prisma.task.findMany({
      where: { id: { in: Array.from(allTaskIds) } },
      select: { id: true, title: true },
    });

    const taskNodes = tasks.map((t) => ({ id: t.id, title: t.title, durationWorkDays: 0, isMilestone: false }));
    const graph = {
      nodes: new Map(taskNodes.map((t) => [t.id, t])),
      edges: graphEdges,
    };

    const cycle = hasCycle(graph);
    return res.json({ data: { wouldCreateCycle: cycle } });
  })
);
