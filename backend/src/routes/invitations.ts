import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import * as orgService from '../services/organizationService.js';
import { asyncHandler, badRequest, forbidden } from '../utils/routeHelpers.js';

const invitationServiceInstance = orgService.createInvitationService(prisma);

export const router = Router();

// Jika ada organisasi default di session, beri kemudahan: POST /api/invitations
// Namun karena akses harus terikat organisasi, kita gunakan POST /api/invitations
// dengan body { organizationId }? atau pilih organisasi default user.
// Kita pakai organisasi default (pertama) bila tidak ada params.

// POST /api/invitations — buat undangan (gunakan organisasi default user)
router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const { email, role, name, expiresInDays, organizationId } = req.body as {
      email: string;
      role?: 'admin' | 'member';
      name?: string;
      expiresInDays?: number;
      organizationId?: string;
    };
    if (!email) return next(badRequest('Email wajib diisi.'));

    // Tentukan organisasi target
    let orgId = organizationId;
    if (!orgId) {
      // Cari organisasi default (pemilik atau admin pertama)
      const memberships = await prisma.organizationMembership.findMany({
        where: { userId: user.id },
        orderBy: [
          { role: 'asc' },
        ],
      });
      const priority = (r: string | null) => {
        if (r === 'owner') return 0;
        if (r === 'admin') return 1;
        if (r === 'member') return 2;
        return 3;
      };
      memberships.sort((a, b) => priority(a.role) - priority(b.role));
      if (memberships.length > 0) {
        orgId = memberships[0].organizationId;
      }
    }
    if (!orgId) {
      return next(badRequest('Tidak ada organisasi yang dapat diakses. Buat organisasi terlebih dahulu.'));
    }

    const expiresAt =
      expiresInDays && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const invitation = await invitationServiceInstance.create(
      user.id,
      orgId,
      role || 'member',
      email,
      name || null,
      expiresAt
    );
    return res.status(201).json({ data: invitation, message: 'Undangan berhasil dibuat.' });
  })
);

// GET /api/invitations — daftar undangan (di semua organisasi yang diakses user)
router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id },
    });
    const orgs = memberships.map((m) => m.organizationId);
    if (orgs.length === 0) {
      return res.json({ data: [] });
    }

    const invitations = await prisma.invitation.findMany({
      where: { organizationId: { in: orgs } },
      include: {
        invitedByUser: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      data: invitations.map((inv) => ({
        id: inv.id,
        organizationId: inv.organizationId,
        organizationName: inv.organization.name,
        code: inv.code,
        role: inv.role,
        invitedBy: inv.invitedBy,
        invitedByName: inv.invitedByName,
        invitedEmail: inv.invitedEmail,
        expiresAt: inv.expiresAt?.toISOString() || null,
        usedAt: inv.usedAt?.toISOString() || null,
        createdAt: inv.createdAt.toISOString(),
      })),
    });
  })
);

// DELETE /api/invitations/:invitationId — batalkan undangan
router.delete(
  '/:invitationId',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const inv = await prisma.invitation.findUnique({
      where: { id: req.params.invitationId },
      include: { organization: true },
    });
    if (!inv) return next(badRequest('Undangan tidak ditemukan.'));

    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: inv.organizationId } },
    });
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return next(forbidden('Hanya pemilik atau admin yang dapat membatalkan undangan.'));
    }

    await prisma.invitation.delete({ where: { id: req.params.invitationId } });
    return res.json({ message: 'Undangan berhasil dibatalkan.' });
  })
);

// POST /api/invitations/:code/accept — terima undangan
router.post(
  '/:code/accept',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) return next(badRequest('Anda harus masuk.'));

    const membership = await invitationServiceInstance.accept(user.id, req.params.code);
    return res.json({ data: membership, message: 'Anda bergabung ke organisasi.' });
  })
);
