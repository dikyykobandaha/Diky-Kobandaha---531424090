import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/lib/prisma';

describe('Task API', () => {
  let authCookie = '';
  let organizationId = '';
  let eventId = '';
  let userId = '';

  beforeAll(async () => {
    // Login sebagai admin
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'Password123!',
      });

    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    authCookie = cookies.find((c: string) => c.startsWith('session=')) || '';

    // Dapatkan user info
    const meRes = await request(app)
      .get('/auth/me')
      .set('Cookie', authCookie);

    organizationId = meRes.body.data.user.organizationId || '';
    userId = meRes.body.data.user.id;
  });

  beforeEach(async () => {
    // Bersihkan data test
    await prisma.task.deleteMany({
      where: {
        title: { contains: 'Test Task' },
      },
    }).catch(() => {});

    await prisma.event.deleteMany({
      where: {
        name: { contains: 'Test Event For Task' },
      },
    }).catch(() => {});
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: {
        title: { contains: 'Test Task' },
      },
    }).catch(() => {});

    await prisma.event.deleteMany({
      where: {
        name: { contains: 'Test Event For Task' },
      },
    }).catch(() => {});

    await prisma.$disconnect();
  });

  it('POST /tasks - harus membuat tugas baru', async () => {
    // Buat event dulu
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event For Task',
        description: 'Event untuk testing tugas',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    eventId = eventRes.body.data.id;

    const res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Test Task 1',
        description: 'Tugas testing',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'high',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [userId],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.title).toBe('Test Task 1');
    expect(res.body.data.priority).toBe('high');
    expect(res.body.data.status).toBe('not_started');
    expect(res.body.data.progress).toBe(0);
    expect(res.body.data.durationDays).toBe(3);
  });

  it('POST /tasks - harus gagal jika progres > 100', async () => {
    // Buat event
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event For Task Validation',
        description: 'Event untuk testing validasi',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = eventRes.body.data.id;

    const res = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Test Task Invalid',
        description: 'Tugas dengan progres tidak valid',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'medium',
        status: 'not_started',
        progress: 150, // Invalid
        isMilestone: false,
        assigneeIds: [userId],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('progres');
  });

  it('POST /tasks - harus gagal jika tugas bergantung pada dirinya sendiri', async () => {
    // Buat event
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event For Self Dependency',
        description: 'Event untuk testing dependensi self',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = eventRes.body.data.id;

    // Buat tugas
    const taskRes = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Test Task Self Dependency',
        description: 'Tugas untuk testing dependensi',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [userId],
      });

    const taskId = taskRes.body.data.id;

    // Coba tambahkan dependensi ke dirinya sendiri
    const res = await request(app)
      .patch(`/tasks/${taskId}/dependencies`)
      .set('Cookie', authCookie)
      .send({
        addDependency: {
          predecessorId: taskId,
          lagDays: 0,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('dirinya sendiri');
  });

  it('PATCH /tasks/:id - harus memperbarui tugas', async () => {
    // Buat event
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event For Update',
        description: 'Event untuk testing update',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = eventRes.body.data.id;

    // Buat tugas
    const taskRes = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Test Task Update',
        description: 'Tugas untuk testing update',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [userId],
      });

    const taskId = taskRes.body.data.id;

    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set('Cookie', authCookie)
      .send({
        title: 'Updated Task Title',
        progress: 50,
        status: 'in_progress',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Updated Task Title');
    expect(res.body.data.progress).toBe(50);
    expect(res.body.data.status).toBe('in_progress');
  });

  it('DELETE /tasks/:id - harus menghapus tugas', async () => {
    // Buat event
    const eventRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event For Delete',
        description: 'Event untuk testing delete',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = eventRes.body.data.id;

    // Buat tugas
    const taskRes = await request(app)
      .post('/tasks')
      .set('Cookie', authCookie)
      .send({
        eventId: eventId,
        title: 'Test Task Delete',
        description: 'Tugas untuk testing delete',
        startDate: '2025-12-01',
        durationDays: 3,
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        isMilestone: false,
        assigneeIds: [userId],
      });

    const taskId = taskRes.body.data.id;

    const res = await request(app)
      .delete(`/tasks/${taskId}`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
