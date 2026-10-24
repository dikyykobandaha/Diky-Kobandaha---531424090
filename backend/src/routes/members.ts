import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { isOrgOwner, isOrgAdmin } from '../utils/routeHelpers.js';

export const router = Router();

// GET /api/members?organizationId=... — daftar anggota organisasi
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const orgId = req.query.organizationId as string | undefined;
    if (!orgId) {
      return next(badRequest('organizationId wajib disediakan.'));
    }

    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: orgId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: [
        { role: 'asc' },
        { joinedAt: 'desc' },
      ],
    });

    return res.json({
      data: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        organizationId: m.organizationId,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        user: m.user,
      })),
    });
  })
);

// GET /api/members/:id — detail keanggotaan anggota
router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const membership = await prisma.organizationMembership.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!membership) return next(notFound('Keanggotaan tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, membership.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    return res.json({ data: membership });
  })
);

// PUT /api/members/:id/role — ubah peran anggota
router.put(
  '/:id/role',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const membership = await prisma.organizationMembership.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!membership) return next(notFound('Keanggotaan tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, membership.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat mengubah peran anggota.'));
    }

    const { role } = req.body as { role?: string };
    if (!role || (role !== 'admin' && role !== 'member' && role !== 'owner')) {
      return next(badRequest('Peran tidak valid.'));
    }

    // Owner tidak bisa diubah perannya
    if (membership.role === 'owner' && role !== 'owner') {
      return next(badRequest('Tidak dapat mengubah peran pemilik organisasi.'));
    }

    const updated = await prisma.organizationMembership.update({
      where: { id: req.params.id },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true } },
        organization: true,
      },
    });

    return res.json({ data: updated, message: 'Peran anggota berhasil diubah.' });
  })
);

// DELETE /api/members/:id — keluarkan anggota
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const membership = await prisma.organizationMembership.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!membership) return next(notFound('Keanggotaan tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, membership.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat mengeluarkan anggota.'));
    }

    if (membership.role === 'owner') {
      return next(badRequest('Tidak dapat mengeluarkan pemilik organisasi.'));
    }

    const removed = await prisma.organizationMembership.delete({
      where: { id: req.params.id },
      include: { user: { select: { id: true, name: true } } },
    });

    // Reset role user jika tidak punya organisasi lain
    const otherOrgs = await prisma.organizationMembership.count({
      where: { userId: removed.userId },
    });
    if (otherOrgs === 0) {
      await prisma.user.update({
        where: { id: removed.userId },
        data: { role: 'member' },
      });
    }

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: membership.organizationId,
        type: 'member_removed',
        description: `Mengeluarkan anggota "${removed.user.name}" dari organisasi.`,
        entityId: removed.id,
        entityName: removed.user.name,
      },
    });

    return res.json({ message: 'Anggota berhasil dikeluarkan.' });
  })
);

// GET /api/members/:id/tasks — daftar tugas yang ditugaskan ke anggota
router.get(
  '/:id/tasks',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const membership = await prisma.organizationMembership.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!membership) return next(notFound('Anggota tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, membership.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { assigneeId: membership.userId },
          { assigneeIds: { contains: JSON.stringify([membership.userId]) } },
          { taskMembers: { some: { userId: membership.userId } } },
        ],
        event: { organizationId: membership.organizationId },
      },
      include: {
        event: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        taskMembers: {
          include: { user: { select: { id: true, name: true } } },
        },
        _count: { select: { children: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json({
      data: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        eventId: t.eventId,
        eventName: t.event.name,
        startDate: t.startDate?.toISOString().slice(0, 10) || null,
        endDate: t.endDate?.toISOString().slice(0, 10) || null,
        durationDays: t.durationDays,
        priority: t.priority,
        status: t.status,
        progress: t.progress,
        isMilestone: t.isMilestone,
        childrenCount: t._count.children,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  })
);

// GET /api/members/:id/workload — beban kerja anggota
router.get(
  '/:id/workload',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const membership = await prisma.organizationMembership.findUnique({
      where: { id: req.params.id },
      include: { organization: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!membership) return next(notFound('Anggota tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, membership.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const now = new Date();

    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { assigneeId: membership.userId },
          { assigneeIds: { contains: JSON.stringify([membership.userId]) } },
          { taskMembers: { some: { userId: membership.userId } } },
        ],
        event: { organizationId: membership.organizationId },
      },
      include: {
        event: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    const assignedCount = tasks.length;
    const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
    const overdueCount = tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'cancelled') return false;
      if (t.endDate) {
        const end = new Date(t.endDate);
        if (end < now) return true;
      }
      return false;
    }).length;
    const notStartedCount = tasks.filter((t) => t.status === 'not_started').length;
    const doneCount = tasks.filter((t) => t.status === 'done').length;

    return res.json({
      data: {
        userId: membership.userId,
        userName: membership.user.name,
        userEmail: membership.user.email,
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        workload: {
          assignedCount,
          inProgressCount,
          overdueCount,
          notStartedCount,
          doneCount,
        },
      },
    });
  })
);
