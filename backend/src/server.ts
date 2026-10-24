import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
config({ path: path.resolve(__filename, '..', '..', '.env') });

import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import session from 'cookie-session';
import rateLimit from 'express-rate-limit';
import { getEnv, validateEnv } from './config.js';
import { authMiddleware, selectOrganizationMiddleware, csrfProtection } from './middleware/auth.js';
import { router as authRoutes } from './routes/auth.js';
import { router as organizationRoutes } from './routes/organizations.js';
import { router as invitationsRoutes } from './routes/invitations.js';
import { router as eventsRoutes } from './routes/events.js';
import { router as tasksRoutes } from './routes/tasks.js';
import { router as dependenciesRoutes } from './routes/dependencies.js';
import { router as calendarRoutes } from './routes/calendar.js';
import { router as holidaysRoutes } from './routes/holidays.js';
import { router as leavesRoutes } from './routes/leaves.js';
import { router as resourcesRoutes } from './routes/resources.js';
import { router as membersRoutes } from './routes/members.js';
import { router as ganttRoutes } from './routes/gantt.js';
import { router as pertRoutes } from './routes/pert.js';
import { router as cpmRoutes } from './routes/cpm.js';
import { router as analyticsRoutes } from './routes/analytics.js';
import { router as activitiesRoutes } from './routes/activities.js';
import { router as csvRoutes } from './routes/csv.js';
import { prisma } from './lib/prisma.js';

// Validate environment variables on startup
validateEnv();

const env = getEnv();

const app: Application = express();

// ---- Trust proxy ----
app.set('trust proxy', 1); // Set ke 1 untuk development dengan proxy, atau false jika tidak ada proxy

// ---- Helmet (kecuali testing) ----
if (env.NODE_ENV !== 'test') {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Vite HMR memerlukan unsafe-inline di dev
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", env.CORS_ORIGIN, 'http://localhost:5173'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
}

// ---- CORS ----
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Accept'],
  })
);

// ---- Compression ----
app.use(compression());

// ---- Body parsing ----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ---- Session ----
app.use(
  session({
    name: 'eventflow_session',
    secret: env.SESSION_SECRET,
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: env.SESSION_MAX_AGE_SECONDS * 1000,
    overwrite: true,
    signed: true,
  } as any)
);

// ---- Rate limiting (kecuali test & static) ----
const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak request. Coba lagi nanti.' },
  skip: (req) => req.path.startsWith('/health') || req.path.startsWith('/favicon'),
});

// Jalankan CSRF protection secara umum (tapi token check dilakukan di route yang relevan)
app.use(csrfProtection((req) => {
  // token disimpan di session; route auth menghasilkan token untuk client
  const sess = (req as any).session as { csrfToken?: string } | undefined;
  return sess?.csrfToken;
}));

app.use(apiLimiter);

// ---- Prisma di request ----
app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

// ---- Auth middleware ----
app.use(authMiddleware(prisma));
app.use(selectOrganizationMiddleware(prisma));

// ---- Health ----
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), nodeEnv: env.NODE_ENV });
});

// ---- CSRF endpoint (di luar middleware karena perlu generate token) ----
app.get('/auth/csrf', async (req: Request, res: Response) => {
  const crypto = await import('crypto');
  const session = (req as any).session as any;
  if (!session) {
    return res.status(500).json({ message: 'Sesi tidak tersedia.' });
  }
  if (!session.csrfToken) {
    session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.json({ token: session.csrfToken });
});

// ---- Routes ----
app.use('/auth', authRoutes);
app.use('/organizations', organizationRoutes);
app.use('/invitations', invitationsRoutes);
app.use('/events', eventsRoutes);
app.use('/tasks', tasksRoutes);
app.use('/dependencies', dependenciesRoutes);
app.use('/calendar', calendarRoutes);
app.use('/holidays', holidaysRoutes);
app.use('/leaves', leavesRoutes);
app.use('/resources', resourcesRoutes);
app.use('/members', membersRoutes);
app.use('/gantt', ganttRoutes);
app.use('/pert', pertRoutes);
app.use('/cpm', cpmRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/activities', activitiesRoutes);
app.use('/csv', csvRoutes);

// ---- 404 ----
app.use((_req, res) => {
  res.status(404).json({ message: 'Rute tidak ditemukan.' });
});

// ---- Error handler ----
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err?.stack || err);
  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({
    message: status === 500 ? 'Terjadi kesalahan internal.' : err?.message || 'Terjadi kesalahan.',
    ...(process.env.NODE_ENV === 'development' && { stack: err?.stack }),
  });
});

// ---- Export untuk testing ----
export { app };

const port = parseInt(env.PORT, 10);
const host = env.HOST;
app.listen(port, host, () => {
  console.log(`[EventFlow] Backend listening on http://${env.HOST}:${port}`);
  console.log(`[EventFlow] Frontend development: http://localhost:5173`);
  console.log(`[EventFlow] API base: http://localhost:${port}/api`);
});
