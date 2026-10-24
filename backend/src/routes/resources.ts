import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { toDateString } from '../utils/routeHelpers.js';

export const router = Router();

// GET /api/resources — daftar sumber daya organisasi
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

    const resources = await prisma.resource.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });

    return res.json({
      data: resources.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: r.role,
        availability: r.availability,
        rate: r.rate,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  })
);

// POST /api/resources — buat sumber daya
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { organizationId, name, email, phone, role, availability, rate, notes } = req.body as {
      organizationId?: string;
      name?: string;
      email?: string;
      phone?: string;
      role?: string;
      availability?: string;
      rate?: number;
      notes?: string;
    };

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return next(badRequest('Nama sumber daya minimal 2 karakter.'));
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
      return next(forbidden(' Hanya owner atau admin yang dapat membuat sumber daya.'));
    }

    const resource = await prisma.resource.create({
      data: {
        organizationId: orgId,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        role: role?.trim() || null,
        availability: availability?.trim() || null,
        rate: rate != null && !isNaN(rate) ? rate : null,
        notes: notes?.trim() || null,
      },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        type: 'resource_created',
        description: `Menambahkan sumber daya "${resource.name}".`,
        entityId: resource.id,
        entityName: resource.name,
      },
    });

    return res.status(201).json({ data: resource, message: 'Sumber daya berhasil ditambahkan.' });
  })
);

// GET /api/resources/:id — detail sumber daya
router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: { organization: true, user: { select: { id: true, email: true } } },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke sumber daya ini.'));
    }

    // Batasi email/phone jika user bukan owner/admin
    const isAdminOrOwner = access.role === 'owner' || access.role === 'admin';
    const data = {
      id: resource.id,
      name: resource.name,
      email: isAdminOrOwner ? resource.email : null,
      phone: isAdminOrOwner ? resource.phone : null,
      role: resource.role,
      availability: resource.availability,
      rate: isAdminOrOwner ? resource.rate : null,
      userId: resource.userId,
      createdAt: resource.createdAt.toISOString(),
      updatedAt: resource.updatedAt.toISOString(),
    };

    return res.json({ data });
  })
);

// PUT /api/resources/:id — edit sumber daya
router.put(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke sumber daya ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat mengubah sumber daya.'));
    }

    const { name, email, phone, role, availability, rate, notes } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      role?: string;
      availability?: string;
      rate?: number;
      notes?: string;
    };

    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) {
      return next(badRequest('Nama sumber daya minimal 2 karakter.'));
    }

    const updated = await prisma.resource.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        email: email !== undefined ? (email?.trim() || null) : undefined,
        phone: phone !== undefined ? (phone?.trim() || null) : undefined,
        role: role !== undefined ? (role?.trim() || null) : undefined,
        availability: availability !== undefined ? (availability?.trim() || null) : undefined,
        rate: rate !== undefined ? (rate != null && !isNaN(rate) ? rate : null) : undefined,
        notes: notes !== undefined ? (notes?.trim() || null) : undefined,
      },
    });

    return res.json({ data: updated, message: 'Sumber daya berhasil diperbarui.' });
  })
);

// DELETE /api/resources/:id — hapus sumber daya
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke sumber daya ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menghapus sumber daya.'));
    }

    // Cek ada tidaknya resource assignment
    const assignmentCount = await prisma.resourceAssignment.count({ where: { resourceId: resource.id } });
    if (assignmentCount > 0) {
      return next(badRequest('Sumber daya memiliki penugasan tugas. Hapus penugasan terlebih dahulu.'));
    }

    await prisma.resource.delete({ where: { id: req.params.id } });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: resource.organizationId,
        type: 'resource_deleted',
        description: `Menghapus sumber daya "${resource.name}".`,
        entityId: resource.id,
        entityName: resource.name,
      },
    });

    return res.json({ message: 'Sumber daya berhasil dihapus.' });
  })
);

// GET /api/resources/:id/tasks — daftar tugas resource + beban kerja
router.get(
  '/:id/tasks',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke sumber daya ini.'));
    }

    // Dapatkan tugas yang ditugaskan ke resource ini (melalui resourceAssignment atau TaskMember)
    const assignments = await prisma.resourceAssignment.findMany({
      where: { resourceId: resource.id },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            status: true,
            isMilestone: true,
            priority: true,
            durationDays: true,
            progress: true,
            event: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    // Ambil juga tugas yang ditugaskan melalui TaskMember (userID)
    const taskMembers = resource.userId
      ? await prisma.taskMember.findMany({
      where: { userId: resource.userId },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            status: true,
            isMilestone: true,
            priority: true,
            durationDays: true,
            progress: true,
            event: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
      : [];
    const leavePeriods = await prisma.leavePeriod.findMany({
      where: { resourceId: resource.id },
    });

    const tasks = [
      ...assignments.map((a) => ({
        ...a.task,
        assignmentId: a.id,
        isResourceAssignment: true,
        conflict: !!leavePeriods.find((l) => {
          const taskStart = a.task.startDate ? new Date(a.task.startDate) : null;
          const taskEnd = a.task.endDate ? new Date(a.task.endDate) : null;
          if (!taskStart) return false;
          return taskStart <= l.endDate && (!taskEnd || taskEnd >= l.startDate);
        }),
        note: leavePeriods.find((l) => {
          const taskStart = a.task.startDate ? new Date(a.task.startDate) : null;
          const taskEnd = a.task.endDate ? new Date(a.task.endDate) : null;
          if (!taskStart) return false;
          return taskStart <= l.endDate && (!taskEnd || taskEnd >= l.startDate);
        })?.name || null,
      })),
      ...taskMembers
        .filter((m) => !assignments.some((a) => a.taskId === m.task.id))
        .map((m) => ({
          ...m.task,
          assignmentId: m.id,
          isResourceAssignment: false,
          conflict: !!leavePeriods.find((l) => {
            const taskStart = m.task.startDate ? new Date(m.task.startDate) : null;
            const taskEnd = m.task.endDate ? new Date(m.task.endDate) : null;
            if (!taskStart) return false;
            return taskStart <= l.endDate && (!taskEnd || taskEnd >= l.startDate);
          }),
          note: leavePeriods.find((l) => {
            const taskStart = m.task.startDate ? new Date(m.task.startDate) : null;
            const taskEnd = m.task.endDate ? new Date(m.task.endDate) : null;
            if (!taskStart) return false;
            return taskStart <= l.endDate && (!taskEnd || taskEnd >= l.startDate);
          })?.name || null,
        })),
    ];

    // Hitung beban kerja
    const assignedCount = tasks.length;
    const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
    const overdueCount = tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'cancelled') return false;
      if (t.endDate) {
        const end = new Date(t.endDate);
        if (end < new Date()) return true;
      }
      return false;
    }).length;

    return res.json({
      data: {
        tasks,
        workload: {
          assignedCount,
          inProgressCount,
          overdueCount,
        },
        leavePeriods: leavePeriods.map((l) => ({
          id: l.id,
          name: l.name,
          startDate: l.startDate.toISOString().slice(0, 10),
          endDate: l.endDate.toISOString().slice(0, 10),
        })),
      },
    });
  })
);

// POST /api/resources/:id/assignments — tambah resource assignment ke tugas
router.post(
  '/:id/assignments',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke sumber daya ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menugaskan sumber daya.'));
    }

    const { taskId } = req.body as { taskId?: string };
    if (!taskId) return next(badRequest('taskId wajib disediakan.'));

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { event: { include: { organization: true } } },
    });
    if (!task) return next(notFound('Tugas tidak ditemukan.'));

    if (task.event.organizationId !== resource.organizationId) {
      return next(badRequest('Tugas tidak berada di organisasi sumber daya ini.'));
    }

    const existing = await prisma.resourceAssignment.findUnique({
      where: { resourceId_taskId: { resourceId: resource.id, taskId } },
    });
    if (existing) {
      return next(badRequest('Penugasan sudah ada.'));
    }

    const assignment = await prisma.resourceAssignment.create({
      data: {
        resourceId: resource.id,
        taskId,
      },
      include: {
        resource: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    });

    // Sinkronisasi TaskMember: pastikan user yang terkait resource terdaftar di tugas
    if (resource.userId) {
      await prisma.taskMember.upsert({
        where: { taskId_userId: { taskId, userId: resource.userId } },
        create: { taskId, userId: resource.userId },
        update: {},
      });
    }

    // Cek konflik cuti
    const leavePeriods = await prisma.leavePeriod.findMany({
      where: { resourceId: resource.id },
    });
    let conflict = false;
    let note = null;
    if (task.startDate || task.endDate) {
      for (const lp of leavePeriods) {
        const taskStart = task.startDate ? new Date(task.startDate) : null;
        const taskEnd = task.endDate ? new Date(task.endDate) : null;
        if (!taskStart) continue;
        if (taskStart <= lp.endDate && (!taskEnd || taskEnd >= lp.startDate)) {
          conflict = true;
          note = lp.name;
          break;
        }
      }
    }

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: resource.organizationId,
        type: 'resource_assignment',
        description: `Menugaskan "${resource.name}" ke "${task.title}".`,
        entityId: assignment.id,
        entityName: `${resource.name} → ${task.title}`,
      },
    });

    return res.status(201).json({
      data: {
        ...assignment,
        conflict,
        note,
      },
      message: conflict
        ? 'Penugasan berhasil dibuat, tetapi ada peringatan konflik dengan periode cuti.'
        : 'Penugasan berhasil dibuat.',
    });
  })
);

// DELETE /api/resources/:id/assignments/:assignmentId — hapus resource assignment
router.delete(
  '/:id/assignments/:assignmentId',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke sumber daya ini.'));
    }
    if (access.role !== 'owner' && access.role !== 'admin') {
      return next(forbidden(' Hanya owner atau admin yang dapat menghapus penugasan.'));
    }

    const assignment = await prisma.resourceAssignment.findUnique({
      where: { id: req.params.assignmentId },
    });
    if (!assignment || assignment.resourceId !== resource.id) {
      return next(notFound('Penugasan tidak ditemukan.'));
    }

    await prisma.resourceAssignment.delete({ where: { id: req.params.assignmentId } });

    await prisma.activity.create({
      data: {
        userId: user.id,
        organizationId: resource.organizationId,
        type: 'resource_assignment_deleted',
        description: `Mencabut penugasan "${resource.name}".`,
        entityId: assignment.id,
        entityName: `${resource.name}`,
      },
    });

    return res.json({ message: 'Penugasan berhasil dicabut.' });
  })
);

// GET /api/resources/:id/conflicts — daftar tugas yang bertabrakan dengan cuti resource
router.get(
  '/:id/conflicts',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    });
    if (!resource) return next(notFound('Sumber daya tidak ditemukan.'));

    const access = await requireOrgAccess(prisma, user.id, resource.organizationId);
    if (!access.allowed) {
      return next(forbidden(' Anda tidak memiliki akses ke sumber daya ini.'));
    }

    const leavePeriods = await prisma.leavePeriod.findMany({
      where: { resourceId: resource.id },
    });

    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { resourceAssignments: { some: { resourceId: resource.id } } },
          { taskMembers: { some: { userId: resource.userId ?? resource.id } } },
        ],
      },
      include: {
        event: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        taskMembers: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    const conflicts = tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'cancelled') return false;
      const taskStart = t.startDate ? new Date(t.startDate) : null;
      const taskEnd = t.endDate ? new Date(t.endDate) : null;
      if (!taskStart) return false;
      return leavePeriods.some((lp) => {
        return taskStart <= lp.endDate && (!taskEnd || taskEnd >= lp.startDate);
      });
    });

    return res.json({
      data: {
        resourceId: resource.id,
        resourceName: resource.name,
        conflicts: conflicts.map((t) => ({
          taskId: t.id,
          title: t.title,
          startDate: t.startDate?.toISOString().slice(0, 10) || null,
          endDate: t.endDate?.toISOString().slice(0, 10) || null,
          status: t.status,
          isMilestone: t.isMilestone,
          leavePeriods: leavePeriods
            .filter((lp) => {
              const taskStart = t.startDate ? new Date(t.startDate) : null;
              const taskEnd = t.endDate ? new Date(t.endDate) : null;
              if (!taskStart) return false;
              return taskStart <= lp.endDate && (!taskEnd || taskEnd >= lp.startDate);
            })
            .map((lp) => ({
              id: lp.id,
              name: lp.name,
              startDate: lp.startDate.toISOString().slice(0, 10),
              endDate: lp.endDate.toISOString().slice(0, 10),
            })),
          eventName: t.event.name,
        })),
        leavePeriods: leavePeriods.map((l) => ({
          id: l.id,
          name: l.name,
          startDate: l.startDate.toISOString().slice(0, 10),
          endDate: l.endDate.toISOString().slice(0, 10),
        })),
      },
    });
  })
);
