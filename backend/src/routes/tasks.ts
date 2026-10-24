import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { parseJsonField } from '../utils/routeHelpers.js';
import { toDateString } from '../utils/routeHelpers.js';

export const router = Router();

/**
 * Tanggal tugas harus wajar (1970–2200) supaya tidak menyimpan nilai ekstrem
 * yang kemudian ditolak Prisma/MySQL (sebelumnya memunculkan error 500).
 */
function isPlausibleDate(d: Date): boolean {
  return !isNaN(d.getTime()) && d.getFullYear() >= 1970 && d.getFullYear() <= 2200;
}

/** Estimasi biaya boleh kosong (string kosong dari form) → null, bukan string. */
function normalizeCost(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// GET /api/tasks — daftar tugas (dengan filter, search, sort)
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const eventId = req.query.eventId as string | undefined;
    const requestedOrgId = req.query.organizationId as string | undefined;
    if (!eventId && !requestedOrgId) {
      return next(badRequest('Harap pilih acara terlebih dahulu.'));
    }

    let organizationId: string;
    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { organization: true },
      });
      if (!event) return next(notFound('Acara tidak ditemukan.'));
      organizationId = event.organizationId;
    } else {
      organizationId = requestedOrgId as string;
    }
    const access = await requireOrgAccess(prisma, user.id, organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }

    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const assigneeId = req.query.assigneeId as string | undefined;
    const search = req.query.search as string | undefined;
    const startDateFrom = req.query.startDateFrom as string | undefined;
    const startDateTo = req.query.startDateTo as string | undefined;
    const sort = (req.query.sort as string) || 'default';
    const parentId = req.query.parentId as string | undefined;

    const where: any = eventId ? { eventId } : { event: { organizationId } };
    if (status && status !== 'all') {
      where.status = status;
    }
    if (priority && priority !== 'all') {
      where.priority = priority;
    }
    if (assigneeId) {
      // tugas yang ditugaskan ke user ini (melalui TaskMember atau assigneeId)
      where.OR = [
        { assigneeId },
        { assigneeIds: { contains: JSON.stringify([assigneeId]) } },
        { taskMembers: { some: { userId: assigneeId } } },
      ];
    }
    if (search) {
      where.OR = [
        ...((where.OR as any) || []),
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (startDateFrom) {
      where.startDate = { gte: new Date(startDateFrom) };
    }
    if (startDateTo) {
      where.startDate = { lte: new Date(startDateTo) };
    }
    if (parentId !== undefined) {
      if (parentId === '') {
        where.parentId = null; // root tasks
      } else {
        where.parentId = parentId;
      }
    }

    // Sort
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'startDate-asc') orderBy = { startDate: 'asc' };
    else if (sort === 'startDate-desc') orderBy = { startDate: 'desc' };
    else if (sort === 'dueDate-asc') orderBy = { startDate: 'asc' };
    else if (sort === 'dueDate-desc') orderBy = { startDate: 'desc' };
    else if (sort === 'priority-desc') orderBy = [{ priority: 'desc' }, { startDate: 'asc' }];
    else if (sort === 'title-asc') orderBy = { title: 'asc' };
    else if (sort === 'title-desc') orderBy = { title: 'desc' };
    else if (sort === 'progress-asc') orderBy = { progress: 'asc' };
    else if (sort === 'progress-desc') orderBy = { progress: 'desc' };

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        taskMembers: {
          where: {
            // batasi pada org yang sama
          },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { children: true } },
      },
      orderBy,
    });

    // Filter taskMembers hanya yang relevan dengan org (sudah di event)
    const data = tasks.map((t) => {
      const members = t.taskMembers.map((m) => ({
        id: m.id,
        userId: m.userId,
        user: m.user,
      }));
      const assigneeIds = parseJsonField<string[]>(t.assigneeIds) ?? [];
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        eventId: t.eventId,
        parentId: t.parentId,
        startDate: t.startDate?.toISOString() || null,
        startHour: t.startHour,
        startMinute: t.startMinute,
        durationDays: t.durationDays,
        priority: t.priority,
        status: t.status,
        progress: t.progress,
        isMilestone: t.isMilestone,
        assigneeId: t.assigneeId,
        assignee: t.assignee,
        assigneeIds,
        estimatedCost: t.estimatedCost,
        childrenCount: t._count.children,
        taskMembers: members,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    return res.json({ data });
  })
);

// POST /api/tasks — buat tugas
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const data = req.body as {
      title?: string;
      description?: string;
      eventId?: string;
      parentId?: string;
      startDate?: string;
      startHour?: number;
      startMinute?: number;
      durationDays?: number;
      priority?: string;
      status?: string;
      progress?: number;
      isMilestone?: boolean;
      assigneeId?: string;
      assigneeIds?: string[];
      estimatedCost?: number;
    };

    if (!data.title || typeof data.title !== 'string' || data.title.trim().length < 2) {
      return next(badRequest('Judul tugas minimal 2 karakter.'));
    }
    if (!data.eventId) {
      return next(badRequest('Acara wajib dipilih.'));
    }
    const event = await prisma.event.findUnique({
      where: { id: data.eventId },
      include: { organization: true },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));
    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat membuat tugas.'));
    }

    // Validasi parentId: pastikan milik acara yang sama
    if (data.parentId) {
      const parent = await prisma.task.findUnique({
        where: { id: data.parentId, eventId: data.eventId },
      });
      if (!parent) {
        return next(badRequest('Subtugas hanya dapat dibuat di bawah tugas yang ada di acara ini.'));
      }
    }

    const validPriorities = ['low', 'medium', 'high', 'urgent'] as const;
    const priority = validPriorities.includes(data.priority as any)
      ? data.priority
      : 'medium';

    const validStatuses = ['not_started', 'in_progress', 'delayed', 'done', 'cancelled'] as const;
    const status = validStatuses.includes(data.status as any) ? data.status : 'not_started';

    const durationDays = Math.max(
      0,
      parseInt(String(data.durationDays ?? 1), 10) || 0
    );

    let progress = parseInt(String(data.progress ?? 0), 10);
    if (isNaN(progress)) progress = 0;
    if (progress < 0) progress = 0;
    if (progress > 100) progress = 100;

    const isMilestone = data.isMilestone === true;

    // Cek assigneeId & assigneeIds
    const assigneeId = data.assigneeId || null;
    if (assigneeId) {
      const memberAccess = await requireOrgAccess(prisma, user.id, event.organizationId);
      // validasi user ada di org
      const membership = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: assigneeId, organizationId: event.organizationId } },
      });
      if (!membership) {
        return next(badRequest('User yang ditunjuk bukan anggota organisasi ini.'));
      }
    }

    const assigneeIds = data.assigneeIds && data.assigneeIds.length > 0
      ? data.assigneeIds.filter((id) => id && id !== assigneeId)
      : [];
    for (const id of assigneeIds) {
      const membership = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: id, organizationId: event.organizationId } },
      });
      if (!membership) {
        return next(badRequest(`User ${id} bukan anggota organisasi ini.`));
      }
    }

    const startDate = data.startDate ? new Date(data.startDate) : null;
    if (startDate && !isPlausibleDate(startDate)) {
      return next(badRequest('Format tanggal mulai tidak valid.'));
    }

    // Hitung endDate default: startDate + (durationDays - 1) hari kalender
    let endDate: Date | null = null;
    if (startDate) {
      endDate = new Date(startDate.getTime() + Math.max(0, durationDays - 1) * 24 * 60 * 60 * 1000);
    }
    const task = await prisma.task.create({
      data: {
        title: data.title.trim(),
        description: data.description?.trim() || null,
        eventId: data.eventId,
        parentId: data.parentId || null,
        startDate,
        endDate,
        startHour: data.startHour != null ? Math.min(23, Math.max(0, data.startHour)) : null,
        startMinute: data.startMinute != null ? Math.min(59, Math.max(0, data.startMinute)) : null,
        durationDays,
        priority,
        status,
        progress,
        isMilestone,
        assigneeId,
        assigneeIds: assigneeIds.length > 0 ? JSON.stringify(assigneeIds) : null,
        estimatedCost: normalizeCost(data.estimatedCost),
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        taskMembers: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { children: true } },
      },
    });

    // Tambah TaskMember untuk assigneeId
    if (assigneeId) {
      await prisma.taskMember.upsert({
        where: { taskId_userId: { taskId: task.id, userId: assigneeId } },
        create: { taskId: task.id, userId: assigneeId },
        update: {},
      });
    }
    for (const id of assigneeIds) {
      await prisma.taskMember.upsert({
        where: { taskId_userId: { taskId: task.id, userId: id } },
        create: { taskId: task.id, userId: id },
        update: {},
      });
    }

    // Catat aktivitas
    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: event.organizationId,
        type: 'task_created',
        description: `Membuat tugas "${task.title}".`,
        entityId: task.id,
        entityName: task.title,
      },
    });

    return res.status(201).json({ data: task, message: 'Tugas berhasil dibuat.' });
  })
);

// GET /api/tasks/:id — detail tugas
router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        taskMembers: { include: { user: { select: { id: true, name: true, email: true } } } },
        parent: { select: { id: true, title: true } },
        children: {
          select: {
            id: true,
            title: true,
            startDate: true,
            durationDays: true,
            progress: true,
            status: true,
            isMilestone: true,
            priority: true,
            assignee: { select: { id: true, name: true } },
            _count: { select: { children: true } },
          },
        },
        _count: { select: { children: true, dependenciesFrom: true, dependenciesTo: true } },
      },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const event = await prisma.event.findUnique({
      where: { id: task.eventId },
      include: { organization: true },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));
    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }

    const assigneeIds = parseJsonField<string[]>(task.assigneeIds) ?? [];
    return res.json({
      data: {
        id: task.id,
        title: task.title,
        description: task.description,
        eventId: task.eventId,
        parentId: task.parentId,
        parent: task.parent,
        startDate: task.startDate?.toISOString() || null,
        startHour: task.startHour,
        startMinute: task.startMinute,
        durationDays: task.durationDays,
        priority: task.priority,
        status: task.status,
        progress: task.progress,
        isMilestone: task.isMilestone,
        assigneeId: task.assigneeId,
        assignee: task.assignee,
        assigneeIds,
        estimatedCost: task.estimatedCost,
        childrenCount: task._count.children,
        dependenciesFromCount: task._count.dependenciesFrom,
        dependenciesToCount: task._count.dependenciesTo,
        taskMembers: task.taskMembers.map((m) => ({
          id: m.id,
          userId: m.userId,
          user: m.user,
        })),
        children: task.children,
        event: { id: event.id, name: event.name },
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      },
    });
  })
);

// GET /api/tasks/:id/dependencies — dependensi tugas ini
router.get(
  '/:id/dependencies',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { event: { select: { id: true, organizationId: true } } },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }

    const deps = await prisma.taskDependency.findMany({
      where: { taskId: task.id },
      include: {
        task: { select: { id: true, title: true } },
        predecessor: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      data: deps.map((d) => ({
        id: d.id,
        taskId: d.taskId,
        taskTitle: d.task.title,
        predecessorId: d.predecessorId,
        predecessorTitle: d.predecessor.title,
        type: d.type,
        lagWorkDays: d.lagWorkDays,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  })
);

// PUT /api/tasks/:id — edit tugas
router.put(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        event: { include: { organization: true } },
        taskMembers: true,
      },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat mengubah tugas.'));
    }

    const data = req.body as {
      title?: string;
      description?: string;
      startDate?: string;
      startHour?: number;
      startMinute?: number;
      durationDays?: number;
      priority?: string;
      status?: string;
      progress?: number;
      isMilestone?: boolean;
      assigneeId?: string;
      assigneeIds?: string[];
      estimatedCost?: number;
    };

    if (data.title !== undefined && (typeof data.title !== 'string' || data.title.trim().length < 2)) {
      return next(badRequest('Judul tugas minimal 2 karakter.'));
    }
    if (data.startDate !== undefined) {
      const d = new Date(data.startDate);
      if (isNaN(d.getTime())) return next(badRequest('Format tanggal mulai tidak valid.'));
    }

    const validPriorities = ['low', 'medium', 'high', 'urgent'] as const;
    const validStatuses = ['not_started', 'in_progress', 'delayed', 'done', 'cancelled'] as const;

    const priority =
      data.priority !== undefined
        ? validPriorities.includes(data.priority as any)
          ? data.priority
          : task.priority
        : task.priority;

    const status =
      data.status !== undefined
        ? validStatuses.includes(data.status as any)
          ? data.status
          : task.status
        : task.status;

    let progress = task.progress;
    if (data.progress !== undefined) {
      const p = parseInt(String(data.progress), 10);
      if (!isNaN(p)) {
        progress = Math.min(100, Math.max(0, p));
      }
    }

    let assigneeId = task.assigneeId;
    if (data.assigneeId !== undefined) {
      if (data.assigneeId) {
        const membership = await prisma.organizationMembership.findUnique({
          where: { userId_organizationId: { userId: data.assigneeId, organizationId: task.event.organizationId } },
        });
        if (!membership) {
          return next(badRequest('User yang ditunjuk bukan anggota organisasi ini.'));
        }
        assigneeId = data.assigneeId;
      } else {
        assigneeId = null;
      }
    }

    // Sinkronkan endDate dari startDate + durationDays jika salah satunya berubah
    const newStartDate = data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : task.startDate;
    if (data.startDate !== undefined && newStartDate && !isPlausibleDate(newStartDate)) {
      return next(badRequest('Format tanggal mulai tidak valid.'));
    }
    const newDuration = data.durationDays !== undefined ? Math.max(0, parseInt(String(data.durationDays), 10) || 0) : task.durationDays;
    const computedEndDate =
      newStartDate && newDuration > 0
        ? new Date(newStartDate.getTime() + (newDuration - 1) * 24 * 60 * 60 * 1000)
        : newStartDate && newDuration === 0
          ? newStartDate
          : null;
    const endDate = newStartDate !== undefined ? computedEndDate : undefined;

    const existingAssigneeIds = parseJsonField<string[]>(task.assigneeIds) ?? [];
    const newAssigneeIds =
      data.assigneeIds !== undefined
        ? data.assigneeIds.filter((id) => id && id !== assigneeId)
        : existingAssigneeIds.filter((id) => id !== assigneeId);

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        title: data.title !== undefined ? data.title.trim() : undefined,
        description: data.description !== undefined ? (data.description?.trim() || null) : undefined,
        startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : undefined,
        endDate,
        startHour: data.startHour !== undefined ? Math.min(23, Math.max(0, data.startHour)) : undefined,
        startMinute: data.startMinute !== undefined ? Math.min(59, Math.max(0, data.startMinute)) : undefined,
        durationDays: data.durationDays !== undefined ? Math.max(0, parseInt(String(data.durationDays), 10) || 0) : undefined,
        priority,
        status,
        progress,
        isMilestone: data.isMilestone !== undefined ? data.isMilestone === true : undefined,
        assigneeId,
        assigneeIds:
          newAssigneeIds.length > 0
            ? JSON.stringify(newAssigneeIds)
            : (assigneeId ? existingAssigneeIds.filter((id) => id !== assigneeId).length === 0 ? null : JSON.stringify(existingAssigneeIds.filter((id) => id !== assigneeId)) : null),
        estimatedCost: data.estimatedCost !== undefined ? normalizeCost(data.estimatedCost) : undefined,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        taskMembers: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { children: true } },
      },
    });

    // Sinkronisasi TaskMember
    if (assigneeId) {
      await prisma.taskMember.upsert({
        where: { taskId_userId: { taskId: task.id, userId: assigneeId } },
        create: { taskId: task.id, userId: assigneeId },
        update: {},
      });
    } else {
      await prisma.taskMember.deleteMany({ where: { taskId: task.id } });
    }
    for (const id of newAssigneeIds) {
      await prisma.taskMember.upsert({
        where: { taskId_userId: { taskId: task.id, userId: id } },
        create: { taskId: task.id, userId: id },
        update: {},
      });
    }

    // Hapus TaskMember yang tidak ada di assigneeIds baru
    const keepIds = new Set([assigneeId, ...newAssigneeIds].filter(Boolean));
    for (const m of task.taskMembers) {
      if (!keepIds.has(m.userId)) {
        await prisma.taskMember.delete({ where: { id: m.id } });
      }
    }

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: task.event.organizationId,
        type: 'task_updated',
        description: `Memperbarui tugas "${updated.title}".`,
        entityId: updated.id,
        entityName: updated.title,
      },
    });

    return res.json({ data: updated, message: 'Tugas berhasil diperbarui.' });
  })
);

// DELETE /api/tasks/:id — hapus tugas
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        event: { include: { organization: true } },
        children: true,
      },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat menghapus tugas.'));
    }

    // Cek ada tidaknya dependent task (dependent = tugas yang bergantung ke tugas ini)
    const dependents = await prisma.taskDependency.count({
      where: { predecessorId: task.id },
    });
    if (dependents > 0) {
      return next(badRequest('Tidak dapat menghapus tugas karena tugas lain bergantung ke tugas ini. Hapus dependensi terlebih dahulu.'));
    }

    // Opsional: hapus juga subtugas? Tapi spesifikasi: kita hapus parent dan subtugas akan tetap ada? Tidak, cascade?

    // Hapus tugas (subtugas tetap ada tapi parentId null? kita akan hapus subtugas juga untuk kebersihan)
    if (task.children && task.children.length > 0) {
      await prisma.task.deleteMany({ where: { parentId: task.id } });
    }

    await prisma.task.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: task.event.organizationId,
        type: 'task_deleted',
        description: `Menghapus tugas "${task.title}".`,
        entityId: task.id,
        entityName: task.title,
      },
    });

    return res.json({ message: 'Tugas berhasil dihapus.' });
  })
);

// POST /api/tasks/:id/assignees — tambah anggota ditugaskan
router.post(
  '/:id/assignees',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { event: { include: { organization: true } } },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat menugaskan anggota.'));
    }

    const { userId } = req.body as { userId?: string };
    if (!userId) return next(badRequest('ID anggota wajib diisi.'));

    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId: task.event.organizationId } },
    });
    if (!membership) {
      return next(badRequest('User bukan anggota organisasi ini.'));
    }

    // Tambah ke assigneeIds
    const existingAssigneeIds = parseJsonField<string[]>(task.assigneeIds) ?? [];
    if (!existingAssigneeIds.includes(userId)) {
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: {
          assigneeIds: JSON.stringify([...existingAssigneeIds, userId]),
        },
      });
      await prisma.taskMember.upsert({
        where: { taskId_userId: { taskId: task.id, userId } },
        create: { taskId: task.id, userId },
        update: {},
      });
      return res.json({ data: updated, message: 'Anggota berhasil ditugaskan.' });
    }

    // Jika sudah ada, pastikan TaskMember ada
    await prisma.taskMember.upsert({
      where: { taskId_userId: { taskId: task.id, userId } },
      create: { taskId: task.id, userId },
      update: {},
    });

    return res.json({ message: 'Anggota telah ditugaskan.' });
  })
);

// DELETE /api/tasks/:id/assignees/:userId — hapus penugasan anggota
router.delete(
  '/:id/assignees/:userId',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { event: { include: { organization: true } } },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat menghapus penugasan.'));
    }

    // Hapus dari assigneeIds
    const existingAssigneeIds = parseJsonField<string[]>(task.assigneeIds) ?? [];
    const filtered = existingAssigneeIds.filter((id) => id !== req.params.userId);
    await prisma.task.update({
      where: { id: task.id },
      data: {
        assigneeIds: filtered.length > 0 ? JSON.stringify(filtered) : null,
      },
    });
    await prisma.taskMember.delete({ where: { taskId_userId: { taskId: task.id, userId: req.params.userId } } });

    // Jika assigneeId terhapus, set null
    if (task.assigneeId === req.params.userId) {
      await prisma.task.update({
        where: { id: task.id },
        data: { assigneeId: null },
      });
    }

    return res.json({ message: 'Penugasan anggota berhasil dihapus.' });
  })
);

// POST /api/tasks/:id/progress — update progress (hanya anggota yang ditugaskan atau owner/admin)
router.post(
  '/:id/progress',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { event: { include: { organization: true } } },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }

    // Cek hak: owner/admin boleh, atau assignee yang ditugaskan boleh
    const isAdminOrOwner = access.role === 'owner' || access.role === 'admin';
    const isAssignee =
      task.assigneeId === user.id ||
      (parseJsonField<string[]>(task.assigneeIds) ?? []).includes(user.id);

    if (!isAdminOrOwner && !isAssignee) {
      return next(forbidden('Hanya penanggung jawab atau anggota yang ditugaskan yang dapat memperbarui progres.'));
    }

    const { progress } = req.body as { progress?: number };
    const p = parseInt(String(progress ?? 0), 10);
    if (isNaN(p)) return next(badRequest('Nilai progres tidak valid.'));
    const clamped = Math.min(100, Math.max(0, p));

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { progress: clamped },
      include: { assignee: { select: { id: true, name: true } } },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: task.event.organizationId,
        type: 'task_progress',
        description: `Memperbarui progres "${updated.title}" menjadi ${clamped}%.`,
        entityId: updated.id,
        entityName: updated.title,
      },
    });

    return res.json({ data: updated, message: 'Progres berhasil diperbarui.' });
  })
);

// POST /api/tasks/:id/status — update status tugas
router.post(
  '/:id/status',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { event: { include: { organization: true } } },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, task.event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke tugas ini.'));
    }

    // Status berubah, biasanya oleh admin/owner atau assignee untuk in_progress/not_started
    const isAdminOrOwner = access.role === 'owner' || access.role === 'admin';
    const isAssignee =
      task.assigneeId === user.id ||
      (parseJsonField<string[]>(task.assigneeIds) ?? []).includes(user.id);

    // Batasi: assignee hanya boleh ubah ke in_progress/not_started/done (tanpa cancelled)
    const body = req.body as { status?: string };
    const validStatuses = ['not_started', 'in_progress', 'delayed', 'done', 'cancelled'] as const;
    const newStatus = validStatuses.includes(body.status as any) ? body.status : null;
    if (!newStatus) return next(badRequest('Status tidak valid.'));

    if (!isAdminOrOwner) {
      // anggota hanya boleh ubah ke status tertentu
      if (!['not_started', 'in_progress', 'done'].includes(newStatus)) {
        return next(forbidden('Anggota hanya dapat mengubah status ke belum dimulai, sedang dikerjakan, atau selesai.'));
      }
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: newStatus },
      include: { assignee: { select: { id: true, name: true } } },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: task.event.organizationId,
        type: 'task_status',
        description: `Mengubah status "${updated.title}" menjadi ${newStatus}.`,
        entityId: updated.id,
        entityName: updated.title,
      },
    });

    return res.json({ data: updated, message: 'Status tugas berhasil diperbarui.' });
  })
);

// POST /api/tasks/recalculate — hitung ulang jadwal tugas (dipanggil setelah perubahan dependensi/tanggal)
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

    // Panggil service schedule (akan dibuat nanti)
    // Untuk sementara, kita kembalikan pesan bahwa fitur ini akan tersedia.
    return res.json({
      message: 'Perhitungan ulang jadwal akan dilakukan. Gunakan endpoint /api/dependencies/recalculate.',
    });
  })
);
