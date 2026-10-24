import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/lib/prisma';

describe('TaskDependency API', () => {
  let authCookie = '';
  let organizationId = '';
  let eventId = '';
  let task1Id = '';
  let task2Id = '';

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'Password123!',
      });

    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    authCookie = cookies.find((c: string) => c.startsWith('session=')) || '';

    const meRes = await request(app)
      .get('/auth/me')
      .set('Cookie', authCookie);

    organizationId = meRes.body.data.user.organizationId || '';
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({
      where: {
        title: { contains: 'Dependency Test' },
      },
    }).catch(() => {});

    await prisma.event.deleteMany({
      where: {
        name: { contains: 'Dependency Test Event' },
      },
    }).catch(() => {});

    await prisma.taskDependency.deleteMany().catch(() => {});
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: {
        title: { contains: 'Dependency Test' },
      },
    }).catch(() => {});

    await prisma.event.deleteMany({
      where: {
        name: { contains: 'Dependency Test Event' },
      },
    }).catch(() => {});

    await prisma.$disconnect();
  });

  it('POST /tasks/:id/dependencies - harus menambahkan dependensi F2S', async () => {
    // Setup: buat event dan 2 tugas
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Dependency Test Event',
        description: 'Event untuk testing dependensi',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    eventId = eventRes.body.data.id;

    const task1Res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Dependency Test Task 1',
        description: 'Tugas pendahulu',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [],
      });

    task1Id = task1Res.body.data.id;

    const task2Res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Dependency Test Task 2',
        description: 'Tugas penerus',
        startDate: '2025-12-04',
        durationDays: 2,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [],
      });

    task2Id = task2Res.body.data.id;

    // Tambahkan dependensi F2S dari task1 ke task2
    const res = await request(app)
      .patch(`/tasks/${task2Id}/dependencies`)
      .set('Cookie', authCookie)
      .send({
        addDependency: {
          predecessorId: task1Id,
          lagDays: 1,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('dependencies');
    expect(res.body.data.dependencies.length).toBe(1);
    expect(res.body.data.dependencies[0].type).toBe('F2S');
    expect(res.body.data.dependencies[0].lagDays).toBe(1);
    expect(res.body.data.dependencies[0].predecessorId).toBe(task1Id);
    expect(res.body.data.dependencies[0].successorId).toBe(task2Id);
  });

  it('POST /tasks/:id/dependencies - harus menambahkan dependensi S2S', async () => {
    // Setup: buat event dan 2 tugas baru
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'S2S Test Event',
        description: 'Event untuk testing S2S',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = eventRes.body.data.id;

    const task1Res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'S2S Test Task 1',
        description: 'Tugas pendahulu',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [],
      });

    const task1Id = task1Res.body.data.id;

    const task2Res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'S2S Test Task 2',
        description: 'Tugas penerus',
        startDate: '2025-12-01',
        durationDays: 2,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [],
      });

    const task2Id = task2Res.body.data.id;

    // Tambahkan dependensi S2S
    const res = await request(app)
      .patch(`/tasks/${task2Id}/dependencies`)
      .set('Cookie', authCookie)
      .send({
        addDependency: {
          predecessorId: task1Id,
          type: 'S2S',
          lagDays: 0,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dependencies.length).toBe(1);
    expect(res.body.data.dependencies[0].type).toBe('S2S');
  });

  it('POST /tasks/:id/dependencies - harus gagal jika membentuk siklus', async () => {
    // Setup: buat event dan 2 tugas
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Cycle Test Event',
        description: 'Event untuk testing siklus',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = eventRes.body.data.id;

    const task1Res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Cycle Test Task 1',
        description: 'Tugas 1',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [],
      });

    const task1Id = task1Res.body.data.id;

    const task2Res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Cycle Test Task 2',
        description: 'Tugas 2',
        startDate: '2025-12-04',
        durationDays: 2,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [],
      });

    const task2Id = task2Res.body.data.id;

    // Tambahkan dependensi task1 -> task2
    await request(app)
      .patch(`/tasks/${task2Id}/dependencies`)
      .set('Cookie', authCookie)
      .send({
        addDependency: {
          predecessorId: task1Id,
          lagDays: 0,
        },
      });

    // Coba tambahkan dependensi task2 -> task1 (akan membentuk siklus)
    const res = await request(app)
      .patch(`/tasks/${task1Id}/dependencies`)
      .set('Cookie', authCookie)
      .send({
        addDependency: {
          predecessorId: task2Id,
          lagDays: 0,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('siklus');
  });

  it('GET /tasks/:id/dependencies - harus mengembalikan daftar dependensi', async () => {
    // Setup
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Get Dependencies Test Event',
        description: 'Event untuk testing get dependencies',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = eventRes.body.data.id;

    const task1Res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Get Dependencies Task 1',
        description: 'Tugas 1',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [],
      });

    const task1Id = task1Res.body.data.id;

    const task2Res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Get Dependencies Task 2',
        description: 'Tugas 2',
        startDate: '2025-12-04',
        durationDays: 2,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [],
      });

    const task2Id = task2Res.body.data.id;

    // Tambahkan dependensi
    await request(app)
      .patch(`/tasks/${task2Id}/dependencies`)
      .set('Cookie', authCookie)
      .send({
        addDependency: {
          predecessorId: task1Id,
          lagDays: 0,
        },
      });

    // Get dependencies
    const res = await request(app)
      .get(`/tasks/${task2Id}/dependencies`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('dependencies');
    expect(res.body.data.dependencies.length).toBe(1);
    expect(res.body.data.dependencies[0].predecessorId).toBe(task1Id);
  });
});
