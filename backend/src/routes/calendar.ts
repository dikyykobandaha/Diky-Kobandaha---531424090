import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';

export const router = Router();

// GET /api/calendar — daftar kalender kerja organisasi
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    let orgId = req.query.organizationId as string | undefined;
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
      if (memberships.length === 0) {
        return next(badRequest('Tidak ada organisasi yang dapat diakses.'));
      }
      orgId = memberships[0].organizationId;
    }

    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const calendars = await prisma.workCalendar.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      data: calendars.map((c) => ({
        id: c.id,
        name: c.name,
        organizationId: c.organizationId,
        workingDays: JSON.parse(c.workingDays),
        timezone: c.timezone,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    });
  })
);

// GET /api/calendar/default — kalender kerja default organisasi
router.get(
  '/default',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    let orgId = req.query.organizationId as string | undefined;
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
      if (memberships.length === 0) {
        return next(badRequest('Tidak ada organisasi yang dapat diakses.'));
      }
      orgId = memberships[0].organizationId;
    }

    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const calendar = await prisma.workCalendar.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    });

    if (!calendar) {
      // Kembalikan default kalender standar
      return res.json({
        data: {
          id: null,
          name: 'Kalender Kerja Standar',
          organizationId: orgId,
          workingDays: [1, 2, 3, 4, 5],
          timezone: 'Asia/Jakarta',
        },
      });
    }

    return res.json({
      data: {
        id: calendar.id,
        name: calendar.name,
        organizationId: calendar.organizationId,
        workingDays: JSON.parse(calendar.workingDays),
        timezone: calendar.timezone,
      },
    });
  })
);

// POST /api/calendar — buat kalender kerja
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { organizationId, name, workingDays, timezone } = req.body as {
      organizationId?: string;
      name?: string;
      workingDays?: number[];
      timezone?: string;
    };

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return next(badRequest('Nama kalender minimal 2 karakter.'));
    }

    let orgId = organizationId;
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
      if (memberships.length === 0) {
        return next(badRequest('Tidak ada organisasi yang dapat diakses.'));
      }
      orgId = memberships[0].organizationId;
    }

    const access = await requireOrgAccess(prisma, user.id, orgId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat membuat kalender kerja.'));
    }

    const days: number[] = Array.isArray(workingDays) && workingDays.length > 0
      ? workingDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [1, 2, 3, 4, 5];

    if (days.length === 0) {
      return next(badRequest('Harap pilih setidaknya satu hari kerja.'));
    }

    const calendar = await prisma.workCalendar.create({
      data: {
        name: name.trim(),
        organizationId: orgId,
        workingDays: JSON.stringify(days),
        timezone: timezone || 'Asia/Jakarta',
      },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        type: 'calendar_created',
        description: `Membuat kalender kerja "${calendar.name}".`,
        entityId: calendar.id,
        entityName: calendar.name,
      },
    });

    return res.status(201).json({
      data: {
        id: calendar.id,
        name: calendar.name,
        organizationId: calendar.organizationId,
        workingDays: JSON.parse(calendar.workingDays),
        timezone: calendar.timezone,
        createdAt: calendar.createdAt.toISOString(),
      },
      message: 'Kalender kerja berhasil dibuat.',
    });
  })
);

// PUT /api/calendar/:id — edit kalender kerja
router.put(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const calendar = await prisma.workCalendar.findUnique({
      where: { id: req.params.id },
    });
    if (!calendar) return next(notFound('Kalender kerja tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, calendar.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat mengubah kalender kerja.'));
    }

    const { name, workingDays, timezone } = req.body as {
      name?: string;
      workingDays?: number[];
      timezone?: string;
    };

    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) {
      return next(badRequest('Nama kalender minimal 2 karakter.'));
    }

    const days: number[] | undefined = workingDays !== undefined
      ? workingDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : undefined;

    if (days !== undefined && days.length === 0) {
      return next(badRequest('Harap pilih setidaknya satu hari kerja.'));
    }

    const updated = await prisma.workCalendar.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        workingDays: days !== undefined ? JSON.stringify(days) : undefined,
        timezone: timezone !== undefined ? timezone : undefined,
      },
    });

    return res.json({
      data: {
        id: updated.id,
        name: updated.name,
        organizationId: updated.organizationId,
        workingDays: JSON.parse(updated.workingDays),
        timezone: updated.timezone,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
      message: 'Kalender kerja berhasil diperbarui.',
    });
  })
);

// DELETE /api/calendar/:id — hapus kalender kerja (hanya owner/admin)
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const calendar = await prisma.workCalendar.findUnique({
      where: { id: req.params.id },
    });
    if (!calendar) return next(notFound('Kalender kerja tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, calendar.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menghapus kalender kerja.'));
    }

    // Pastikan tidak ada hari libur yang mengacu ke kalender ini
    const holidayCount = await prisma.holiday.count({ where: { calendarId: calendar.id } });
    if (holidayCount > 0) {
      return next(badRequest('Kalender kerja memiliki hari libur. Hapus hari libur terlebih dahulu.'));
    }

    await prisma.workCalendar.delete({ where: { id: req.params.id } });

    return res.json({ message: 'Kalender kerja berhasil dihapus.' });
  })
);
