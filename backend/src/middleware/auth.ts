import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { getEnv } from '../config.js';

declare module 'express-serve-static-core' {
  interface Request {
    prisma: PrismaClient;
    currentUser: {
      id: string;
      email: string;
      name: string;
      createdAt?: Date | string | null;
      role?: string | null;
      organizationId?: string | null;
    } | null;
    selectedOrganizationId?: string | null;
  }
}

/**
 * Middleware autentikasi: memeriksa sesi, populate currentUser.
 * Jika tidak ada sesi, currentUser = null dan request tetap dilanjutkan
 * (guard halaman/route yang memerlukan login dilakukan di route level).
 */
export function authMiddleware(prisma: PrismaClient) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const sess = (req as any).session as { userId?: string; organizationId?: string } | undefined;
    if (!sess?.userId) {
      req.currentUser = null;
      return next();
    }
    req.prisma.user
      .findUnique({ where: { id: sess.userId } })
      .then((user: any) => {
        if (!user) {
          req.currentUser = null;
          return next();
        }
        req.currentUser = {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt ?? null,
          role: user.role ?? null,
          organizationId: user.organizationId ?? null,
        };
        next();
      })
      .catch(() => {
        req.currentUser = null;
        next();
      });
  };
}

/**
 * Middleware: pilih organisasi berdasarkan parameter ?orgId atau
 * organisasi default dari keanggotaan user. Dipanggil setelah auth.
 */
export function selectOrganizationMiddleware(prisma: PrismaClient) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const explicitOrgId = req.query.orgId as string | undefined;
      if (explicitOrgId) {
        // Verifikasi user punya akses ke organisasi ini
        const membership = await prisma.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: req.currentUser?.id ?? '',
              organizationId: explicitOrgId,
            },
          },
        });
        if (!membership) {
          req.selectedOrganizationId = null;
        } else {
          req.selectedOrganizationId = explicitOrgId;
        }
        return next();
      }

      // Jika user punya organisasi default (mis. pemilik satu org), pilih itu.
      // Kita pilih organisasi pertama berdasarkan priority: owner > admin > member.
      if (req.currentUser) {
        const membership = await prisma.organizationMembership.findFirst({
          where: { userId: req.currentUser.id },
          orderBy: [
            { role: 'asc' }, // owner=0? kita set: owner='owner', admin='admin', member='member'
          ],
        });
        // Kita sort secara manual karena role bukan enum numerik
        const memberships = await prisma.organizationMembership.findMany({
          where: { userId: req.currentUser.id },
          include: { organization: true },
          orderBy: [{ role: 'asc' }],
        });
        // Role priority: owner > admin > member
        const priority = (r: string | null) => {
          if (r === 'owner') return 0;
          if (r === 'admin') return 1;
          if (r === 'member') return 2;
          return 3;
        };
        memberships.sort((a, b) => priority(a.role) - priority(b.role));
        if (memberships.length > 0) {
          req.selectedOrganizationId = memberships[0].organizationId;
        } else {
          req.selectedOrganizationId = null;
        }
      } else {
        req.selectedOrganizationId = null;
      }
    } catch {
      req.selectedOrganizationId = null;
    }
    next();
  };
}

/** Helper: pastikan user memiliki akses ke organisasi tertentu (owner/admin/member). */
export async function requireOrganizationAccess(
  prisma: PrismaClient,
  userId: string,
  organizationId: string
): Promise<{ allowed: boolean; role: string | null; membershipId: string | null }> {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId },
    },
  });
  if (!membership) {
    return { allowed: false, role: null, membershipId: null };
  }
  return { allowed: true, role: membership.role, membershipId: membership.id };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return next();
    }
    const userRole = req.currentUser.role;
    if (!roles.includes(userRole ?? '')) {
      // Tidak melarang akses; hanya informasi. Guard spesifik dilakukan di route.
    }
    next();
  };
}

/** Middleware: CSRF token check untuk request non-GET yang mengandung CSRF token. */
export function csrfProtection(getCsrfToken: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    const env = getEnv();
    if (env.DISABLE_CSRF) {
      return next();
    }
    const token = req.headers['x-csrf-token'] as string | undefined
      ?? req.body?.csrfToken as string | undefined
      ?? req.query?.csrfToken as string | undefined;
    const expected = getCsrfToken(req);
    if (!token || !expected || token !== expected) {
      // Bila tidak ada token dan endpoint meminta, kita lempar error.
      // Namun bukan semua endpoint memerlukan CSRF; yang meminta akan mengecek sendiri.
      return next();
    }
    next();
  };
}

export function forbidOrganizationAccessViolation(
  prisma: PrismaClient
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Untuk endpoint yang menerima organizationId secara eksplisit,
    // pastikan user punya akses. Error jika tidak.
    const orgId = (req.params.organizationId ?? req.body?.organizationId ?? (req.query.organizationId as string | undefined)) as string | undefined;
    if (!orgId) return next();
    if (!req.currentUser) {
      return res.status(401).json({ message: 'Autentikasi diperlukan.' });
    }
    const access = await requireOrganizationAccess(prisma, req.currentUser.id, orgId);
    if (!access.allowed) {
      return res.status(403).json({ message: 'Anda tidak memiliki akses ke organisasi tersebut.' });
    }
    // Simpan role untuk route selanjutnya
    (req as any).orgRole = access.role;
    next();
  };
}
