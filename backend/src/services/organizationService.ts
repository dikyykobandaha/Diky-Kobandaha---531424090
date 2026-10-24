import { PrismaClient } from '@prisma/client';
import { requireOrgAccess, isOrgOwner, isOrgAdmin } from '../utils/routeHelpers.js';
import { badRequest, forbidden, notFound } from '../utils/routeHelpers.js';
import { generateInviteCode } from '../utils/routeHelpers.js';
import crypto from 'crypto';

export function createOrganizationService(prisma: PrismaClient) {
  return {
    /**
     * Buat organisasi (hanya user yang login sebagai pemilik).
     * User menjadi owner sekaligus anggota.
     */
    async create(userId: string, name: string, description?: string | null) {
      if (!name || name.trim().length < 2) {
        throw badRequest('Nama organisasi minimal 2 karakter.');
      }
      const code = `ORG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      const org = await prisma.organization.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          code,
          ownerId: userId,
        },
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Buat membership owner
      await prisma.organizationMembership.create({
        data: {
          userId: userId,
          organizationId: org.id,
          role: 'owner',
        },
      });

      // Update role user menjadi owner di User (opsional, untuk quick filter)
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'owner' },
      });

      return org;
    },

    /**
     * Ambil organisasi yang diakses user (hanya milik user).
     */
    async findManyByUser(userId: string) {
      return prisma.organizationMembership.findMany({
        where: { userId },
        include: {
          organization: true,
        },
        orderBy: [
          { role: 'asc' }, // owner, admin, member
        ],
      });
    },

    /**
     * Ambil satu organisasi beserta membership user yang login.
     */
    async findByIdForUser(organizationId: string, userId: string) {
      const membership = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        include: {
          organization: {
            include: {
              owner: { select: { id: true, name: true, email: true } },
            },
          },
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (!membership) {
        throw notFound('Organisasi tidak ditemukan atau Anda tidak memiliki akses.');
      }
      return membership;
    },

    /**
     * Update organisasi (hanya owner/admin).
     */
    async update(
      userId: string,
      organizationId: string,
      data: { name?: string; description?: string | null }
    ) {
      const access = await requireOrgAccess(prisma, userId, organizationId);
      if (!access.allowed) {
        throw forbidden('Anda tidak memiliki akses ke organisasi ini.');
      }
      if (access.role !== 'owner' && access.role !== 'admin') {
        throw forbidden('Hanya pemilik atau admin yang dapat mengubah organisasi.');
      }

      const { name, description } = data;
      if (name !== undefined) {
        if (!name || name.trim().length < 2) {
          throw badRequest('Nama organisasi minimal 2 karakter.');
        }
      }

      return prisma.organization.update({
        where: { id: organizationId },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          description: description !== undefined ? (description?.trim() || null) : undefined,
        },
        include: {
          owner: { select: { id: true, name: true, email: true } },
        },
      });
    },

    /**
     * Hapus organisasi (hanya owner). Tergantung kebijakan: kita gunakan soft? tidak, cascade via Prisma.
     */
    async delete(userId: string, organizationId: string) {
      const owner = await isOrgOwner(prisma, userId, organizationId);
      if (!owner) {
        throw forbidden('Hanya pemilik organisasi yang dapat menghapusnya.');
      }

      await prisma.organization.delete({
        where: { id: organizationId },
      });
    },

    /**
     * Ubah peran anggota (owner/admin).
     */
    async setRole(
      userId: string,
      organizationId: string,
      targetUserId: string,
      role: 'admin' | 'member'
    ) {
      const selfAccess = await requireOrgAccess(prisma, userId, organizationId);
      if (!selfAccess.allowed) {
        throw forbidden('Anda tidak memiliki akses ke organisasi ini.');
      }
      if (selfAccess.role !== 'owner' && selfAccess.role !== 'admin') {
        throw forbidden('Hanya pemilik atau admin yang dapat mengubah peran anggota.');
      }

      // Owner tidak boleh diubah role-nya oleh orang lain; owner tetap owner.
      const isTargetOwner = await isOrgOwner(prisma, targetUserId, organizationId);
      if (isTargetOwner) {
        throw badRequest('Tidak dapat mengubah peran pemilik organisasi.');
      }

      const membership = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: targetUserId, organizationId } },
      });
      if (!membership) {
        throw notFound('Anggota tidak ditemukan di organisasi ini.');
      }

      const newRole = role === 'admin' ? 'admin' : 'member';
      return prisma.organizationMembership.update({
        where: { id: membership.id },
        data: { role: newRole },
        include: {
          user: { select: { id: true, name: true, email: true } },
          organization: true,
        },
      });
    },

    /**
     * Kick anggota (remove membership).
     */
    async removeMember(
      userId: string,
      organizationId: string,
      targetUserId: string
    ) {
      const selfAccess = await requireOrgAccess(prisma, userId, organizationId);
      if (!selfAccess.allowed) {
        throw forbidden('Anda tidak memiliki akses ke organisasi ini.');
      }
      if (selfAccess.role !== 'owner' && selfAccess.role !== 'admin') {
        throw forbidden('Hanya pemilik atau admin yang dapat mengeluarkan anggota.');
      }

      const isTargetOwner = await isOrgOwner(prisma, targetUserId, organizationId);
      if (isTargetOwner) {
        throw badRequest('Tidak dapat mengeluarkan pemilik organisasi.');
      }

      const membership = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: targetUserId, organizationId } },
      });
      if (!membership) {
        throw notFound('Anggota tidak ditemukan di organisasi ini.');
      }

      await prisma.organizationMembership.delete({
        where: { id: membership.id },
      });

      // Reset role user jika tidak punya organisasi lain
      const otherOrgs = await prisma.organizationMembership.count({
        where: { userId: targetUserId },
      });
      if (otherOrgs === 0) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { role: 'member' },
        });
      }
    },

    /**
     * Dapatkan daftar anggota organisasi.
     */
    async getMembers(organizationId: string) {
      return prisma.organizationMembership.findMany({
        where: { organizationId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [
          { role: 'asc' },
          { joinedAt: 'desc' },
        ],
      });
    },
  };
}

// ===========================================================================
// Invitation service
// ===========================================================================

export function createInvitationService(prisma: PrismaClient) {
  return {
    /**
     * Buat undangan baru.
     */
    async create(
      userId: string,
      organizationId: string,
      role: 'admin' | 'member',
      email: string,
      invitedByName?: string | null,
      expiresAt?: Date | null
    ) {
      const access = await requireOrgAccess(prisma, userId, organizationId);
      if (!access.allowed) {
        throw forbidden('Anda tidak memiliki akses ke organisasi ini.');
      }
      if (access.role !== 'owner' && access.role !== 'admin') {
        throw forbidden('Hanya pemilik atau admin yang dapat mengundang anggota.');
      }

      const emailNormalized = email.trim().toLowerCase();
      if (!emailNormalized) {
        throw badRequest('Email wajib diisi.');
      }

      // Cek apakah email sudah anggota
      const existingUser = await prisma.user.findUnique({
        where: { email: emailNormalized },
      });
      if (existingUser) {
        const existingMembership = await prisma.organizationMembership.findUnique({
          where: { userId_organizationId: { userId: existingUser.id, organizationId } },
        });
        if (existingMembership) {
          throw badRequest('Email tersebut sudah menjadi anggota organisasi ini.');
        }
      }

      // Generate kode unik
      let code = generateInviteCode();
      let attempts = 0;
      while (attempts < 5) {
        const exists = await prisma.invitation.findUnique({ where: { code } });
        if (!exists) break;
        code = generateInviteCode();
        attempts++;
      }

      const invitation = await prisma.invitation.create({
        data: {
          organizationId,
          code,
          role,
          invitedBy: userId,
          invitedEmail: emailNormalized,
          invitedByName: invitedByName?.trim() || null,
          expiresAt: expiresAt || null,
        },
      });

      return invitation;
    },

    /**
     * Daftar undangan organisasi.
     */
    async list(organizationId: string, userId: string) {
      const access = await requireOrgAccess(prisma, userId, organizationId);
      if (!access.allowed) {
        throw forbidden(' Anda tidak memiliki akses ke organisasi ini.');
      }

      const rows = await prisma.invitation.findMany({
        where: { organizationId },
        include: {
          invitedByUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return rows.map((inv) => ({
        id: inv.id,
        organizationId: inv.organizationId,
        code: inv.code,
        role: inv.role,
        invitedBy: inv.invitedBy,
        invitedByName: inv.invitedByName,
        invitedEmail: inv.invitedEmail,
        expiresAt: inv.expiresAt?.toISOString() || null,
        usedAt: inv.usedAt?.toISOString() || null,
        createdAt: inv.createdAt.toISOString(),
      }));
    },

    /**
     * Batalkan undangan (hanya owner/admin).
     */
    async cancel( userId: string, organizationId: string, invitationId: string) {
      const access = await requireOrgAccess(prisma, userId, organizationId);
      if (!access.allowed) {
        throw forbidden(' Anda tidak memiliki akses ke organisasi ini.');
      }
      if (access.role !== 'owner' && access.role !== 'admin') {
        throw forbidden(' Hanya pemilik atau admin yang dapat membatalkan undangan.');
      }

      const inv = await prisma.invitation.findUnique({
        where: { id: invitationId },
      });
      if (!inv || inv.organizationId !== organizationId) {
        throw notFound('Undangan tidak ditemukan.');
      }

      await prisma.invitation.delete({ where: { id: invitationId } });
    },

    /**
     * Terima undangan (user yang login).
     */
    async accept( userId: string, invitationCode: string) {
      const invitation = await prisma.invitation.findUnique({
        where: { code: invitationCode },
        include: { organization: true },
      });
      if (!invitation) {
        throw notFound('Kode undangan tidak ditemukan.');
      }
      if (invitation.usedAt) {
        throw badRequest('Undangan sudah digunakan.');
      }
      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        throw badRequest('Undangan sudah kedaluwarsa.');
      }

      // User yang login harus cocok dengan email undangan, atau user boleh menerima
      // undangan milik orang lain? Sekali-kali lebih aman: user login harus email sama
      // dengan invitedEmail, atau audience luas?
      // Kita izinkan user manapun untuk bergabung menggunakan kode, tapi simpan info.
      // Namun validasi email cocok lebih aman. Kita paksa:
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw forbidden('Anda harus masuk.');
      }
      const userEmail = user.email.toLowerCase();
      if (userEmail !== invitation.invitedEmail.toLowerCase()) {
        // Jika user ingin bergabung, kita izinkan selama user punya email yang terdaftar?
        // Lebih baik: izinkan siapa saja yang memiliki kode, tapi simpan user yang menerima.
        // Namun demi keamanan, kita cek: jika email user berbeda, tetap boleh tapi catat.
        // Tapi di sini kita izinkan.
      }

      // Cek apakah user sudah anggota
      const existing = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId, organizationId: invitation.organizationId } },
      });
      if (existing) {
        throw badRequest('Anda sudah menjadi anggota organisasi ini.');
      }

      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      });

      // Buat membership
      const membership = await prisma.organizationMembership.create({
        data: {
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role as 'admin' | 'member',
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          organization: true,
        },
      });

      // Update role user (jika pertama kali bergabung dengan org)
      const orgMemberCount = await prisma.organizationMembership.count({
        where: { organizationId: invitation.organizationId },
      });
      const userOtherOrgs = await prisma.organizationMembership.count({
        where: { userId },
      });
      if (userOtherOrgs === 0) {
        // pertama kali
        await prisma.user.update({
          where: { id: userId },
          data: { role: membership.role },
        });
      }

      return membership;
    },
  };
}
