import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/lib/prisma';
import { getEnv } from '../src/config';

// Skips jika environment tidak mengarah ke test database
const env = getEnv();

describe('Auth API', () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  const testName = 'Test User';

  beforeEach(async () => {
    // Bersihkan user test sebelum setiap tes
    await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {});
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('POST /auth/register - harus berhasil membuat akun baru', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.user).not.toHaveProperty('password');
  });

  it('POST /auth/register - harus gagal jika email sudah terdaftar', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });

    const res = await request(app)
      .post('/auth/register')
      .send({
        name: 'Another Name',
        email: testEmail,
        password: 'AnotherPassword123!',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('POST /auth/register - harus gagal jika password terlalu pendek', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: '123',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /auth/login - harus berhasil dengan kredensial benar', async () => {
    // Daftarkan user
    await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });

    const res = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('csrfToken');
    expect(res.headers['set-cookie']).toBeDefined();
    const cookies = res.headers['set-cookie'];
    const sessionCookie = cookies.find((c: string) => c.startsWith('session='));
    expect(sessionCookie).toBeDefined();
  });

  it('POST /auth/login - harus gagal dengan password salah', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });

    const res = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('tidak ditemukan');
  });

  it('POST /auth/login - harus gagal jika user belum terdaftar', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: `unknown-${Date.now()}@example.com`,
        password: 'SomePassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /auth/logout - harus berhasil menghapus sesi', async () => {
    // Login dulu
    await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies.find((c: string) => c.startsWith('session=')) || '';

    const res = await request(app)
      .post('/auth/logout')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /auth/me - harus mengembalikan user yang sedang login', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies.find((c: string) => c.startsWith('session=')) || '';

    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
  });

  it('GET /auth/me - harus gagal (401) jika tidak ada sesi', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /auth/change-password - harus berhasil mengubah password', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies.find((c: string) => c.startsWith('session=')) || '';

    const res = await request(app)
      .post('/auth/change-password')
      .set('Cookie', sessionCookie)
      .send({
        currentPassword: testPassword,
        newPassword: 'NewPassword456!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verifikasi password baru bisa digunakan untuk login
    const newLoginRes = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: 'NewPassword456!',
      });

    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.success).toBe(true);

    // Logout dari sesi baru
    const newCookies = newLoginRes.headers['set-cookie'];
    const newSessionCookie = newCookies.find((c: string) => c.startsWith('session=')) || '';
    await request(app)
      .post('/auth/logout')
      .set('Cookie', newSessionCookie);
  });

  it('POST /auth/change-password - harus gagal jika currentPassword salah', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies.find((c: string) => c.startsWith('session=')) || '';

    const res = await request(app)
      .post('/auth/change-password')
      .set('Cookie', sessionCookie)
      .send({
        currentPassword: 'WrongCurrentPassword123!',
        newPassword: 'NewPassword456!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('password saat ini');
  });

  it('GET /events - harus mengembalikan 401 jika tidak ada sesi', async () => {
    const res = await request(app).get('/events');

    expect(res.status).toBe(401);
  });

  it('GET /events - harus mengembalikan 403 jika user belum memilih organisasi', async () => {
    await request(app)
      .post('/auth/register')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies.find((c: string) => c.startsWith('session=')) || '';

    const res = await request(app)
      .get('/events')
      .set('Cookie', sessionCookie);

    // User belum memilih organisasi, harus 403
    expect(res.status).toBe(403);
  });
});
