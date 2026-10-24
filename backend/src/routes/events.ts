import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';

export const router = Router();

// GET /api/events — daftar acara yang diakses user (berdasarkan keanggotaan org)
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const orgId = req.query.organizationId as string | undefined;
    if (orgId) {
      const access = await requireOrgAccess(prisma, user.id, orgId);
      if (!access.allowed) {
        return next(forbidden('Anda tidak memiliki akses ke organisasi ini.'));
      }
    }

    // Jika tidak ada orgId, kita ambil dari organisasi yang diakses user (multiple)
    // Dalam dashboard kita biasanya pakai org yang sedang dipilih.
    const selectedOrgId = req.selectedOrganizationId ?? orgId;
    if (!selectedOrgId) {
      // Jika user tidak memiliki org default, kita return empty atau semua org yang diakses?
      // Lebih baik: user harus pilih org. Tapi untuk UX, kita kembalikan events dari org yang sedang dipilih.
      // Kita return 400 bila tidak ada org yang dipilih.
      return next(badRequest('Harap pilih organisasi terlebih dahulu.'));
    }

    const where: any = { organizationId: selectedOrgId };
    if (req.query.status) {
      where.status = req.query.status;
    }
    if (req.query.search) {
      where.name = { contains: req.query.search, mode: 'insensitive' };
    }
    if (req.query.upcoming === 'true') {
      where.startDate = { gte: new Date() };
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
    });

    // Hitung progres rata-rata
    const eventsWithProgress = await Promise.all(
      events.map(async (e) => {
        const taskCount = e._count.tasks;
        let progress = 0;
        if (taskCount > 0) {
          const sum = await prisma.task.aggregate({
            where: { eventId: e.id },
            _sum: { progress: true },
          });
          progress = Math.round((sum._sum.progress || 0) / taskCount);
        }
        return {
          id: e.id,
          name: e.name,
          description: e.description,
          location: e.location,
          startDate: e.startDate.toISOString(),
          endDate: e.endDate?.toISOString() || null,
          status: e.status,
          ownerId: e.ownerId,
          ownerName: e.owner.name,
          memberIds: e.memberIds ? JSON.parse(e.memberIds) : [],
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
          memberCount: e._count.tasks,
          taskCount: e._count.tasks,
          progress,
        };
      })
    );

    return res.json({ data: eventsWithProgress });
  })
);

// POST /api/events — buat acara
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const data = req.body as {
      name?: string;
      description?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      organizationId?: string;
      memberIds?: string[];
    };

    const orgId = data.organizationId || req.selectedOrganizationId;
    if (!orgId) {
      return next(badRequest('Harap pilih organisasi terlebih dahulu.'));
    }
    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat membuat acara.'));
    }

    if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
      return next(badRequest('Nama acara minimal 2 karakter.'));
    }
    if (!data.startDate) {
      return next(badRequest('Tanggal mulai wajib diisi.'));
    }
    const startDate = new Date(data.startDate);
    if (isNaN(startDate.getTime())) {
      return next(badRequest('Format tanggal mulai tidak valid. Gunakan YYYY-MM-DDTHH:mm:ss.'));
    }
    if (data.endDate) {
      const endDate = new Date(data.endDate);
      if (isNaN(endDate.getTime())) {
        return next(badRequest('Format tanggal selesai tidak valid.'));
      }
      if (endDate < startDate) {
        return next(badRequest('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'));
      }
    }

    const event = await prisma.event.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        location: data.location?.trim() || null,
        startDate,
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: (['planning', 'preparation', 'running', 'finished', 'cancelled'] as const).includes(
          data.status as any
        )
          ? data.status
          : 'planning',
        organizationId: orgId,
        ownerId: user.id,
        memberIds: data.memberIds && data.memberIds.length > 0 ? JSON.stringify(data.memberIds) : null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    // Catat aktivitas
    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        type: 'event_created',
        description: `Membuat acara "${event.name}".`,
        entityId: event.id,
        entityName: event.name,
      },
    });

    return res.status(201).json({ data: event, message: 'Acara berhasil dibuat.' });
  })
);

// GET /api/events/:id — detail acara
router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true, code: true } },
      },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }

    const memberIds = event.memberIds ? JSON.parse(event.memberIds) : [];
    const members = await prisma.organizationMembership.findMany({
      where: {
        organizationId: event.organizationId,
        userId: { in: memberIds },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Hitung progres
    const taskCount = await prisma.task.count({ where: { eventId: event.id } });
    let progress = 0;
    if (taskCount > 0) {
      const sum = await prisma.task.aggregate({ where: { eventId: event.id }, _sum: { progress: true } });
      progress = Math.round((sum._sum.progress || 0) / taskCount);
    }

    return res.json({
      data: {
        ...event,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate?.toISOString() || null,
        memberIds,
        members,
        memberCount: members.length,
        taskCount,
        progress,
      },
    });
  })
);

// PUT /api/events/:id — edit acara
router.put(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat mengubah acara.'));
    }

    const data = req.body as {
      name?: string;
      description?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      memberIds?: string[];
    };

    if (data.name !== undefined && (typeof data.name !== 'string' || data.name.trim().length < 2)) {
      return next(badRequest('Nama acara minimal 2 karakter.'));
    }
    if (data.startDate !== undefined) {
      const startDate = new Date(data.startDate);
      if (isNaN(startDate.getTime())) {
        return next(badRequest('Format tanggal mulai tidak valid.'));
      }
      if (data.endDate !== undefined) {
        const endDate = new Date(data.endDate);
        if (isNaN(endDate.getTime())) {
          return next(badRequest('Format tanggal selesai tidak valid.'));
        }
        if (endDate < startDate) {
          return next(badRequest('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'));
        }
      }
    }

    const updated = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        description: data.description !== undefined ? (data.description?.trim() || null) : undefined,
        location: data.location !== undefined ? (data.location?.trim() || null) : undefined,
        startDate: data.startDate !== undefined ? new Date(data.startDate) : undefined,
        endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : undefined,
        status:
          data.status !== undefined && ['planning', 'preparation', 'running', 'finished', 'cancelled'].includes(
            data.status
          )
            ? data.status
            : undefined,
        memberIds:
          data.memberIds !== undefined
            ? data.memberIds && data.memberIds.length > 0
              ? JSON.stringify(data.memberIds)
              : null
            : undefined,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true, code: true } },
      },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: event.organizationId,
        type: 'event_updated',
        description: `Memperbarui acara "${updated.name}".`,
        entityId: updated.id,
        entityName: updated.name,
      },
    });

    return res.json({ data: updated, message: 'Acara berhasil diperbarui.' });
  })
);

// DELETE /api/events/:id — hapus acara
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!event) return next(notFound('Acara tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, event.organizationId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke acara ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden('Hanya owner atau admin yang dapat menghapus acara.'));
    }

    await prisma.event.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: event.organizationId,
        type: 'event_deleted',
        description: `Menghapus acara "${event.name}".`,
        entityId: event.id,
        entityName: event.name,
      },
    });

    return res.json({ message: 'Acara berhasil dihapus.' });
  })
);

// GET /api/events/stats — statistik acara untuk dashboard (per organisasi)
router.get(
  '/stats',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const orgId = req.query.organizationId as string | undefined;
    if (!orgId) {
      return next(badRequest('Harap pilih organisasi terlebih dahulu.'));
    }
    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden('Anda tidak memiliki akses ke organisasi ini.'));
    }

    const now = new Date();
    const [total, upcoming, running, finished, cancelled, planning, preparation] = await Promise.all([
      prisma.event.count({ where: { organizationId: orgId } }),
      prisma.event.count({
        where: {
          organizationId: orgId,
          startDate: { gte: now },
          status: { notIn: ['cancelled', 'finished'] },
        },
      }),
      prisma.event.count({
        where: {
          organizationId: orgId,
          status: 'running',
          OR: [
            { endDate: { gte: now } },
            { endDate: null },
          ],
        },
      }),
      prisma.event.count({ where: { organizationId: orgId, status: 'finished' } }),
      prisma.event.count({ where: { organizationId: orgId, status: 'cancelled' } }),
      prisma.event.count({ where: { organizationId: orgId, status: 'planning' } }),
      prisma.event.count({ where: { organizationId: orgId, status: 'preparation' } }),
    ]);

    return res.json({
      data: {
        total,
        upcoming,
        running,
        finished,
        cancelled,
        planning,
        preparation,
      },
    });
  })
);
