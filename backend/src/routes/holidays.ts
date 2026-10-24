import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';

export const router = Router();

// GET /api/holidays?calendarId=... — daftar hari libur
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const calendarId = req.query.calendarId as string | undefined;
    if (!calendarId) {
      return next(badRequest('calendarId wajib disediakan.'));
    }

    const calendar = await prisma.workCalendar.findUnique({
      where: { id: calendarId },
    });
    if (!calendar) return next(notFound('Kalender kerja tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, calendar.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const holidays = await prisma.holiday.findMany({
      where: { calendarId },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    });

    return res.json({
      data: holidays.map((h) => ({
        id: h.id,
        calendarId: h.calendarId,
        name: h.name,
        date: h.date.toISOString().slice(0, 10),
        createdAt: h.createdAt.toISOString(),
      })),
    });
  })
);

// POST /api/holidays — tambah hari libur
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { calendarId, name, date } = req.body as {
      calendarId: string;
      name: string;
      date: string;
    };

    if (!calendarId) return next(badRequest('calendarId wajib disediakan.'));
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return next(badRequest('Nama hari libur minimal 2 karakter.'));
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return next(badRequest('Format tanggal wajib YYYY-MM-DD.'));
    }

    const calendar = await prisma.workCalendar.findUnique({
      where: { id: calendarId },
    });
    if (!calendar) return next(notFound('Kalender kerja tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, calendar.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menambah hari libur.'));
    }

    const dateObj = new Date(date + 'T00:00:00');
    if (isNaN(dateObj.getTime())) {
      return next(badRequest('Tanggal tidak valid.'));
    }

    const existing = await prisma.holiday.findUnique({
      where: { calendarId_date: { calendarId, date: dateObj } },
    });
    if (existing) {
      return next(badRequest('Hari libur pada tanggal ini sudah ada.'));
    }

    const holiday = await prisma.holiday.create({
      data: {
        calendarId,
        name: name.trim(),
        date: dateObj,
      },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: calendar.organizationId,
        type: 'holiday_created',
        description: `Menambahkan hari libur "${holiday.name}" pada ${date}.`,
        entityId: holiday.id,
        entityName: holiday.name,
      },
    });

    return res.status(201).json({
      data: {
        id: holiday.id,
        calendarId: holiday.calendarId,
        name: holiday.name,
        date: holiday.date.toISOString().slice(0, 10),
        createdAt: holiday.createdAt.toISOString(),
      },
      message: 'Hari libur berhasil ditambahkan.',
    });
  })
);

// DELETE /api/holidays/:id — hapus hari libur
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const holiday = await prisma.holiday.findUnique({
      where: { id: req.params.id },
      include: { calendar: true },
    });
    if (!holiday) return next(notFound('Hari libur tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, holiday.calendar.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menghapus hari libur.'));
    }

    await prisma.holiday.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: holiday.calendar.organizationId,
        type: 'holiday_deleted',
        description: `Menghapus hari libur "${holiday.name}".`,
        entityId: holiday.id,
        entityName: holiday.name,
      },
    });

    return res.json({ message: 'Hari libur berhasil dihapus.' });
  })
);

// GET /api/holidays/check?calendarId=...&date=... — cek apakah tanggal libur
router.get(
  '/check',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { calendarId, date } = req.query as { calendarId?: string; date?: string };
    if (!calendarId) return next(badRequest('calendarId wajib disediakan.'));
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return next(badRequest('Format tanggal wajib YYYY-MM-DD.'));
    }

    const calendar = await prisma.workCalendar.findUnique({
      where: { id: calendarId },
    });
    if (!calendar) return next(notFound('Kalender kerja tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, calendar.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke organisasi ini.'));
    }

    const dateObj = new Date(date + 'T00:00:00');
    if (isNaN(dateObj.getTime())) {
      return next(badRequest('Tanggal tidak valid.'));
    }

    const holiday = await prisma.holiday.findUnique({
      where: { calendarId_date: { calendarId, date: dateObj } },
    });

    // Cek juga apakah hari kerja berdasarkan workingDays
    const workingDays = JSON.parse(calendar.workingDays) as number[];
    const dayOfWeek = dateObj.getDay();
    const isWorkingDay = workingDays.includes(dayOfWeek);

    return res.json({
      data: {
        calendarId,
        date,
        isHoliday: !!holiday,
        isWorkingDay: !!isWorkingDay,
        holidayName: holiday?.name || null,
      },
    });
  })
);
