import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';

export const router = Router();

// GET /api/activities?organizationId=... — daftar aktivitas terbaru organisasi
router.get(
  '/',
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

    const activities = await prisma.activity.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    return res.json({
      data: activities.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        entityId: a.entityId,
        entityName: a.entityName,
        createdAt: a.createdAt.toISOString(),
        user: a.user ? { id: a.user.id, name: a.user.name } : null,
      })),
    });
  })
);

// DELETE /api/activities/:id — hapus aktivitas (opsional, untuk admin)
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const activity = await prisma.activity.findUnique({
      where: { id: req.params.id },
    });
    if (!activity) return next(notFound('Aktivitas tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, activity.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menghapus aktivitas.'));
    }

    await prisma.activity.delete({ where: { id: req.params.id } });

    return res.json({ message: 'Aktivitas berhasil dihapus.' });
  })
);
