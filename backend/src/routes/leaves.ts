import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';

export const router = Router();

// GET /api/leaves?resourceId=... — daftar periode cuti resource
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const resourceId = req.query.resourceId as string | undefined;
    if (!resourceId) {
      return next(badRequest('resourceId wajib disediakan.'));
    }

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { organization: true },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const leaves = await prisma.leavePeriod.findMany({
      where: { resourceId },
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
    });

    return res.json({
      data: leaves.map((l) => ({
        id: l.id,
        resourceId: l.resourceId,
        name: l.name,
        startDate: l.startDate.toISOString().slice(0, 10),
        endDate: l.endDate.toISOString().slice(0, 10),
        createdAt: l.createdAt.toISOString(),
        _count: {
          tasks: {
            select: { id: true },
            where: {
              resourceAssignments: {
                some: { resourceId },
              },
              startDate: { lte: l.endDate },
              OR: [{ endDate: { gte: l.startDate } }, { endDate: null }],
            },
          },
        },
      })),
    });
  })
);

// POST /api/leaves — tambah periode cuti
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { resourceId, name, startDate, endDate } = req.body as {
      resourceId: string;
      name: string;
      startDate: string;
      endDate: string;
    };

    if (!resourceId) return next(badRequest('resourceId wajib disediakan.'));
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return next(badRequest('Nama periode cuti minimal 2 karakter.'));
    }
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return next(badRequest('startDate wajib YYYY-MM-DD.'));
    }
    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return next(badRequest('endDate wajib YYYY-MM-DD.'));
    }

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { organization: true },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menambah periode cuti.'));
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return next(badRequest('Tanggal tidak valid.'));
    }
    if (end < start) {
      return next(badRequest('endDate tidak boleh lebih awal dari startDate.'));
    }

    // Cek bentrok dengan periode cuti lain
    const conflicts = await prisma.leavePeriod.findMany({
      where: {
        resourceId,
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
    });
    if (conflicts.length > 0) {
      return next(badRequest('Periode cuti bertabrakan dengan periode cuti yang sudah ada.'));
    }

    const leave = await prisma.leavePeriod.create({
      data: {
        resourceId,
        name: name.trim(),
        startDate: start,
        endDate: end,
      },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: resource.organizationId,
        type: 'leave_created',
        description: `Menambahkan periode cuti "${leave.name}" untuk ${resource.name}.`,
        entityId: leave.id,
        entityName: leave.name,
      },
    });

    return res.status(201).json({
      data: {
        id: leave.id,
        resourceId: leave.resourceId,
        name: leave.name,
        startDate: leave.startDate.toISOString().slice(0, 10),
        endDate: leave.endDate.toISOString().slice(0, 10),
        createdAt: leave.createdAt.toISOString(),
      },
      message: 'Periode cuti berhasil ditambahkan.',
    });
  })
);

// DELETE /api/leaves/:id — hapus periode cuti
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const leave = await prisma.leavePeriod.findUnique({
      where: { id: req.params.id },
      include: { resource: { include: { organization: true } } },
    });
    if (!leave) return next(notFound('Periode cuti tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, leave.resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menghapus periode cuti.'));
    }

    await prisma.leavePeriod.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: leave.resource.organizationId,
        type: 'leave_deleted',
        description: `Menghapus periode cuti "${leave.name}".`,
        entityId: leave.id,
        entityName: leave.name,
      },
    });

    return res.json({ message: 'Periode cuti berhasil dihapus.' });
  })
);

// GET /api/leaves/check?resourceId=...&startDate=...&endDate=... — cek apakah resource cuti di periode tersebut
router.get(
  '/check',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { resourceId, startDate, endDate } = req.query as {
      resourceId?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!resourceId) return next(badRequest('resourceId wajib disediakan.'));
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return next(badRequest('startDate wajib YYYY-MM-DD.'));
    }
    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return next(badRequest('endDate wajib YYYY-MM-DD.'));
    }

    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return next(badRequest('Tanggal tidak valid.'));
    }

    const leaves = await prisma.leavePeriod.findMany({
      where: {
        resourceId,
        OR: [{ startDate: { lte: end }, endDate: { gte: start } }],
      },
    });

    return res.json({
      data: {
        resourceId,
        startDate,
        endDate,
        hasLeave: leaves.length > 0,
        leaves: leaves.map((l) => ({
          id: l.id,
          name: l.name,
          startDate: l.startDate.toISOString().slice(0, 10),
          endDate: l.endDate.toISOString().slice(0, 10),
        })),
      },
    });
  })
);
