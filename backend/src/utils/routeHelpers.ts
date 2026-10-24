import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

/**
 * Wrapper async handler agar error dilempar bisa ditangkap error handler Express.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Format error validasi menjadi respons JSON yang konsisten.
 */
export function validationError(message: string, errors?: string[]) {
  const body: { message: string; errors?: string[] } = { message: message || 'Data tidak valid.' };
  if (errors && errors.length > 0) {
    body.errors = errors;
  }
  return body;
}

/**
 * Generate kode undangan unik (alphanumeric, mudah dibaca).
 */
export function generateInviteCode(prefix?: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomPart = Array.from({ length: 8 }, () =>
    chars[crypto.randomInt(0, chars.length)]
  ).join('');
  const suffix = prefix ? `-${prefix.toUpperCase()}` : '';
  return `INV-${randomPart}${suffix}`;
}

/**
 * Pastikan user memiliki akses (owner/admin/member) ke organisasi.
 * Return { allowed, role, membershipId }.
 */
export async function requireOrgAccess(
  prisma: PrismaClient,
  userId: string,
  organizationId: string
) {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });
  if (!membership) {
    return { allowed: false, role: null, membershipId: null };
  }
  return { allowed: true, role: membership.role, membershipId: membership.id };
}

/**
 * Cek apakah user adalah owner organisasi.
 */
export async function isOrgOwner(
  prisma: PrismaClient,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId, ownerId: userId },
  });
  return !!org;
}

/**
 * Cek apakah user adalah admin organisasi.
 */
export async function isOrgAdmin(
  prisma: PrismaClient,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const role = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    select: { role: true },
  });
  return role?.role === 'admin' || role?.role === 'owner';
}

/**
 * Parse JSON field dengan aman.
 */
export function parseJsonField<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Format tanggal ke string YYYY-MM-DD (tanggal saja).
 */
export function toDateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Bentuk error respons 400.
 */
export function badRequest(message: string, errors?: string[]) {
  const err: any = new Error(message);
  err.status = 400;
  err.errors = errors;
  return err;
}

/**
 * Bentuk error respons 403.
 */
export function forbidden(message: string) {
  const err: any = new Error(message);
  err.status = 403;
  return err;
}

/**
 * Bentuk error respons 404.
 */
export function notFound(message: string) {
  const err: any = new Error(message);
  err.status = 404;
  return err;
}

/**
 * Hindari console.log password atau data sensitif.
 */
export function safeLog(message: string, data?: any) {
  if (data) {
    console.log(message, JSON.stringify(data, (key, value) => {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('hash')) {
        return '[REDACTED]';
      }
      return value;
    }, 2));
  } else {
    console.log(message);
  }
}

/**
 * Redirect helper untuk development (bila perlu) — tidak dipakai di API JSON.
 */
export function redirect(res: Response, url: string) {
  res.redirect(url);
}
