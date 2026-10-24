import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import * as orgService from '../services/organizationService.js';
import { asyncHandler, badRequest } from '../utils/routeHelpers.js';

const orgServiceInstance = orgService.createOrganizationService(prisma);
const invitationServiceInstance = orgService.createInvitationService(prisma);

export const router = Router();

// GET /api/organizations — daftar organisasi milik user
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const memberships = await orgServiceInstance.findManyByUser(user.id);
    const data = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      description: m.organization.description,
      code: m.organization.code,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
    return res.json({ data });
  })
);

// POST /api/organizations — buat organisasi
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { name, description } = req.body as { name?: string; description?: string };
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return next(badRequest('Nama organisasi minimal 2 karakter.'));
    }

    const org = await orgServiceInstance.create(user.id, name, description ?? null);
    return res.status(201).json({ data: org, message: 'Organisasi berhasil dibuat.' });
  })
);

// GET /api/organizations/:id — detail organisasi + anggota
router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const membership = await orgServiceInstance.findByIdForUser(req.params.id, user.id);
    const members = await orgServiceInstance.getMembers(req.params.id);

    return res.json({
      data: {
        id: membership.organization.id,
        name: membership.organization.name,
        description: membership.organization.description,
        code: membership.organization.code,
        owner: membership.organization.owner,
        role: membership.role,
        joinedAt: membership.joinedAt.toISOString(),
        members,
      },
    });
  })
);

// PUT /api/organizations/:id — ubah nama/deskripsi
router.put(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { name, description } = req.body as { name?: string; description?: string };
    const org = await orgServiceInstance.update(user.id, req.params.id, {
      name: name !== undefined ? name : undefined,
      description: description !== undefined ? description : undefined,
    });
    return res.json({ data: org, message: 'Organisasi berhasil diperbarui.' });
  })
);

// DELETE /api/organizations/:id — hapus organisasi (hanya owner)
router.delete(
  '/:id',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    await orgServiceInstance.delete(user.id, req.params.id);
    return res.json({ message: 'Organisasi berhasil dihapus.' });
  })
);

// POST /api/organizations/:id/role — ubah peran anggota
router.post(
  '/:id/role',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { userId: targetUserId, role } = req.body as {
      userId: string;
      role: 'admin' | 'member';
    };
    if (!targetUserId) return next(badRequest('ID anggota wajib diisi.'));
    if (role !== 'admin' && role !== 'member') {
      return next(badRequest('Peran tidak valid.'));
    }

    const membership = await orgServiceInstance.setRole(
      user.id,
      req.params.id,
      targetUserId,
      role
    );
    return res.json({ data: membership, message: 'Peran anggota berhasil diubah.' });
  })
);

// DELETE /api/organizations/:id/members/:memberId — keluarkan anggota
router.delete(
  '/:id/members/:memberId',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    await orgServiceInstance.removeMember(user.id, req.params.id, req.params.memberId);
    return res.json({ message: 'Anggota berhasil dikeluarkan.' });
  })
);

// GET /api/organizations/:id/members — daftar anggota (juga diakses via /:id)
router.get(
  '/:id/members',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    await orgServiceInstance.findByIdForUser(req.params.id, user.id); // cek akses
    const members = await orgServiceInstance.getMembers(req.params.id);
    return res.json({ data: members });
  })
);

// POST /api/organizations/:id/invite — buat undangan
router.post(
  '/:id/invite',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { email, role, name, expiresInDays } = req.body as {
      email: string;
      role?: 'admin' | 'member';
      name?: string;
      expiresInDays?: number;
    };
    if (!email) return next(badRequest('Email wajib diisi.'));

    const expiresAt =
      expiresInDays && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const invitation = await invitationServiceInstance.create(
      user.id,
      req.params.id,
      role || 'member',
      email,
      name || null,
      expiresAt
    );
    return res.status(201).json({ data: invitation, message: 'Undangan berhasil dibuat.' });
  })
);

// GET /api/organizations/:id/invitations — daftar undangan
router.get(
  '/:id/invitations',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    await orgServiceInstance.findByIdForUser(req.params.id, user.id); // cek akses
    const invitations = await invitationServiceInstance.list(req.params.id, user.id);
    return res.json({ data: invitations });
  })
);

// DELETE /api/organizations/:id/invitations/:invitationId — batalkan undangan
router.delete(
  '/:id/invitations/:invitationId',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    await invitationServiceInstance.cancel(user.id, req.params.id, req.params.invitationId);
    return res.json({ message: 'Undangan berhasil dibatalkan.' });
  })
);

// POST /api/organizations/invitations/:code/accept — terima undangan
router.post(
  '/invitations/:code/accept',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const membership = await invitationServiceInstance.accept(user.id, req.params.code);
    return res.json({ data: membership, message: 'Anda bergabung ke organisasi.' });
  })
);
