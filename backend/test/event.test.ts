import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/lib/prisma';

describe('Event API', () => {
  let authCookie = '';
  let userToken = '';
  let organizationId = '';

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
    
    // Dapatkan organization ID dari user
    const meRes = await request(app)
      .get('/auth/me')
      .set('Cookie', authCookie);
    
    organizationId = meRes.body.data.user.organizationId || '';
  });

  beforeEach(async () => {
    // Bersihkan event test sebelum setiap tes
    await prisma.event.deleteMany({
      where: {
        name: { contains: 'Test Event' },
      },
    }).catch(() => {});
  });

  afterAll(async () => {
    // Bersihkan event test
    await prisma.event.deleteMany({
      where: {
        name: { contains: 'Test Event' },
      },
    }).catch(() => {});
    await prisma.$disconnect();
  });

  it('POST /events - harus membuat acara baru', async () => {
    const res = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event 1',
        description: 'Acara testing',
        location: 'Ruang Rapat 1',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('Test Event 1');
    expect(res.body.data.status).toBe('planning');
    expect(res.body.data.organizationId).toBe(organizationId);
  });

  it('POST /events - harus gagal jika startDate > endDate', async () => {
    const res = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event Invalid',
        description: 'Acara dengan tanggal tidak valid',
        startDate: '2025-12-15',
        endDate: '2025-12-01',
        status: 'planning',
        organizationId: organizationId,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('tanggal');
  });

  it('POST /events - harus gagal jika status tidak valid', async () => {
    const res = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event Invalid Status',
        description: 'Acara dengan status tidak valid',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'invalid_status',
        organizationId: organizationId,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /events - harus mengembalikan daftar acara', async () => {
    // Buat event dulu
    await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event For List',
        description: 'Testing listing',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const res = await request(app)
      .get('/events')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /events/:id - harus mengembalikan detail acara', async () => {
    // Buat event
    const createRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event Detail',
        description: 'Testing detail',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = createRes.body.data.id;

    const res = await request(app)
      .get(`/events/${eventId}`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(eventId);
    expect(res.body.data.name).toBe('Test Event Detail');
  });

  it('GET /events/:id - harus gagal (404) jika event tidak ditemukan', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000999';
    const res = await request(app)
      .get(`/events/${fakeId}`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /events/:id - harus memperbarui acara', async () => {
    // Buat event
    const createRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event Update',
        description: 'Testing update',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/events/${eventId}`)
      .set('Cookie', authCookie)
      .send({
        name: 'Updated Event Name',
        status: 'preparation',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Event Name');
    expect(res.body.data.status).toBe('preparation');
  });

  it('DELETE /events/:id - harus menghapus acara', async () => {
    // Buat event
    const createRes = await request(app)
      .post('/events')
      .set('Cookie', authCookie)
      .send({
        name: 'Test Event Delete',
        description: 'Testing delete',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        status: 'planning',
        organizationId: organizationId,
      });

    const eventId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/events/${eventId}`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verifikasi sudah terhapus
    const getRes = await request(app)
      .get(`/events/${eventId}`)
      .set('Cookie', authCookie);

    expect(getRes.status).toBe(404);
  });
});
