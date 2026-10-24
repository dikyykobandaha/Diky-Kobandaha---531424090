import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  type RegisterInput,
  type LoginInput,
  type ChangePasswordInput,
} from '../validators/auth.js';
import {
  asyncHandler,
  validationError,
  badRequest,
  forbidden,
  notFound,
  safeLog,
} from '../utils/routeHelpers.js';
import { requireOrgAccess } from '../utils/routeHelpers.js';
import { getEnv } from '../config.js';

export const router = Router();

// --------------------------------------------------------------------
// GET /api/auth/me — info user yang sedang login
// --------------------------------------------------------------------
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = req.currentUser;
    if (!user) {
      return res.status(401).json({ message: 'Tidak ada sesi aktif.' });
    }
    return res.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
        role: user.role ?? null,
        organizationId: req.selectedOrganizationId ?? null,
      },
    });
  })
);

// --------------------------------------------------------------------
// POST /api/auth/register
// --------------------------------------------------------------------
router.post(
  '/register',
  asyncHandler(async (req, res, next) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message);
      return next(badRequest('Data registrasi tidak valid.', issues));
    }
    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return next(badRequest('Email sudah terdaftar. Gunakan email lain atau masuk.'));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        emailVerified: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Set session
    (req.session as any).userId = user.id;

    safeLog('User terdaftar:', { id: user.id, email: user.email });
    return res.status(201).json({ data: user, message: 'Akun berhasil dibuat.' });
  })
);

// --------------------------------------------------------------------
// POST /api/auth/login
// --------------------------------------------------------------------
router.post(
  '/login',
  asyncHandler(async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message);
      return next(badRequest('Data login tidak valid.', issues));
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) {
      return next(badRequest('Email atau kata sandi tidak tepat.'));
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return next(badRequest('Email atau kata sandi tidak tepat.'));
    }

    (req.session as any).userId = user.id;

    safeLog('Login:', { id: user.id, email: user.email });

    return res.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
      message: 'Berhasil masuk.',
    });
  })
);

// --------------------------------------------------------------------
// POST /api/auth/logout
// --------------------------------------------------------------------
router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    const sess = _req.session as any;
    sess.userId = undefined;
    res.clearCookie('eventflow_session', {
      path: '/',
      httpOnly: true,
      secure: getEnv().NODE_ENV === 'production',
      sameSite: getEnv().NODE_ENV === 'production' ? 'none' : 'lax',
    });
    return res.json({ message: 'Berhasil keluar.' });
  })
);

// --------------------------------------------------------------------
// GET /api/auth/csrf — dapatkan CSRF token
// --------------------------------------------------------------------
router.get(
  '/csrf',
  asyncHandler(async (req, res) => {
    const sess = req.session as any;
    if (!sess?.csrfToken) {
      // generate
      const crypto = await import('crypto');
      sess.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    return res.json({ token: sess.csrfToken });
  })
);

// --------------------------------------------------------------------
// POST /api/auth/change-password
// --------------------------------------------------------------------
router.post(
  '/change-password',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) {
      return next(forbidden('Anda harus masuk terlebih dahulu.'));
    }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message);
      return next(badRequest('Data tidak valid.', issues));
    }
    const { currentPassword, newPassword } = parsed.data;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!dbUser) {
      return next(notFound('Pengguna tidak ditemukan.'));
    }

    const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return next(badRequest('Kata sandi saat ini tidak tepat.'));
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // Rotasi CSRF token setelah perubahan sensitif
    const sess = req.session as any;
    if (sess?.csrfToken) {
      const crypto = await import('crypto');
      sess.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    safeLog('Kata sandi diubah:', { id: user.id });
    return res.json({ message: 'Kata sandi berhasil diubah.' });
  })
);

// --------------------------------------------------------------------
// GET /api/auth/organizations — daftar organisasi yang diakses user
// (dipakai di frontend untuk berpindah organisasi)
// --------------------------------------------------------------------
router.get(
  '/organizations',
  asyncHandler(async (req, res, next) => {
    const user = req.currentUser;
    if (!user) {
      return next(forbidden('Anda harus masuk.'));
    }
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            description: true,
            code: true,
          },
        },
      },
      orderBy: { role: 'asc' },
    });
    const priority = (r: string | null) => {
      if (r === 'owner') return 0;
      if (r === 'admin') return 1;
      if (r === 'member') return 2;
      return 3;
    };
    memberships.sort((a, b) => priority(a.role) - priority(b.role));
    return res.json({
      data: memberships.map((m) => ({
        organizationId: m.organization.id,
        name: m.organization.name,
        description: m.organization.description,
        code: m.organization.code,
        role: m.role,
      })),
    });
  })
);
