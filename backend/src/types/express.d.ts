import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  organizationId?: string | null;
} | null;

declare module 'express-serve-static-core' {
  interface Request {
    prisma: PrismaClient;
    currentUser: CurrentUser;
    selectedOrganizationId?: string | null;
    orgRole?: string | null;
  }
}

export {};
