/**
 * Seed data EventFlow (DATA CONTOH/DEMO).
 *
 * Struktur tugas menunjukkan critical path:
 *
 *   A (durasi 3 hari kerja) ──FS──► B (durasi 2, lag 1)
 *                                    │
 *                                 FS  │ (lag 0)
 *                                    ▼
 *                                  C (durasi 1, milestone)
 *
 * Critical path: A → B → C
 *   ES: A=0 EF=3, B=4 EF=6, C=6 EF=6
 *   Project duration = 6 work-day.
 *   Float: A=0, B=0, C=0.
 *
 * Tugas D (independent, durasi 2) → EF=2, float=4 (jika projectDuration=6) → bukan critical.
 *
 * Tugas E (FS dari A, lag 0, durasi 1) → ES=3 EF=4, float=2 (bukan critical).
 *
 * Tugas F (SS dari A, lag 0, durasi 2):
 *   SS: ES_F = ES_A + 0 = 0, EF_F = 2; tapi F juga punya FS dari B? tidak, cukup SS.
 *   Float F? LF = projectDuration = 6, LS_F = 6 - 2 = 4, float = 4 (bukan critical).
 *
 * Tugas G (milestone, FS dari C, lag 0, durasi 0) → ES=6 EF=6, critical.
 *
 * Tugas H (FF? tidak, tugas buffer FS dari G? tidak — jadi H independent).
 *
 * Kita sisipkan juga subtasks untuk menunjukkan hierarki progres berbobot.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Memulai seed EventFlow...');

  // Hapus data lama secara berurutan sesuai dependensi
  await prisma.activity.deleteMany();
  await prisma.leavePeriod.deleteMany();
  await prisma.resourceAssignment.deleteMany();
  await prisma.taskMember.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.event.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.workCalendar.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.session.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  console.log('Data lama dibersihkan.');

  // ---- User ----
  const passwordHash = await bcrypt.hash('Demo123!', 12);

  const owner = await prisma.user.create({
    data: {
      name: 'Ahmad Rizky',
      email: 'ahmad@eventflow.demo',
      passwordHash,
      emailVerified: new Date(),
      role: 'owner',
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: 'Bayu Saputra',
      email: 'bayu@eventflow.demo',
      passwordHash,
      emailVerified: new Date(),
      role: 'admin',
    },
  });

  const member = await prisma.user.create({
    data: {
      name: 'Citra Lestari',
      email: 'citra@eventflow.demo',
      passwordHash,
      emailVerified: new Date(),
      role: 'member',
    },
  });

  const member2 = await prisma.user.create({
    data: {
      name: 'Dimas Prakoso',
      email: 'dimas@eventflow.demo',
      passwordHash,
      emailVerified: new Date(),
      role: 'member',
    },
  });

  // ---- Organization ----
  const organization = await prisma.organization.create({
    data: {
      name: 'Panitia Rahasia 2026',
      description: 'Organisasi penyelenggara acara tahunan 2026.',
      code: 'RAHASIA2026',
      ownerId: owner.id,
    },
  });

  await prisma.organizationMembership.createMany({
    data: [
      { userId: owner.id, organizationId: organization.id, role: 'owner' },
      { userId: admin.id, organizationId: organization.id, role: 'admin' },
      { userId: member.id, organizationId: organization.id, role: 'member' },
      { userId: member2.id, organizationId: organization.id, role: 'member' },
    ],
    skipDuplicates: true,
  });

  // ---- Invitation (kode undangan) ----
  const code = 'RAHASIA2026-MEMBER';
  // Pastikan kode unik
  const existingInvitation = await prisma.invitation.findUnique({ where: { code } });
  if (!existingInvitation) {
    await prisma.invitation.create({
      data: {
        organizationId: organization.id,
        code,
        role: 'member',
        invitedBy: owner.id,
        invitedEmail: 'tamu@contoh.com',
        invitedByName: 'Tamu Undangan',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // ---- WorkCalendar ----
  const calendar = await prisma.workCalendar.create({
    data: {
      name: 'Kalender Kerja Utama',
      organizationId: organization.id,
      workingDays: JSON.stringify([1, 2, 3, 4, 5]), // Senin–Jumat
      timezone: 'Asia/Jakarta',
    },
  });

  // Tambah hari libur contoh
  await prisma.holiday.createMany({
    data: [
      {
        calendarId: calendar.id,
        name: 'Liburan Nasional 1',
        date: new Date('2026-11-10'),
      },
      {
        calendarId: calendar.id,
        name: 'Liburan Nasional 2',
        date: new Date('2026-12-25'),
      },
    ],
    skipDuplicates: true,
  });

  // ---- Resource (sumber daya) ----
  const resource1 = await prisma.resource.create({
    data: {
      organizationId: organization.id,
      name: 'Ahmad Rizky',
      email: 'ahmad@eventflow.demo',
      phone: '+62 812 3456 7890',
      role: 'Koordinator',
      availability: 'Tersedia penuh Senin–Jumat',
      rate: 500000,
      userId: owner.id,
    },
  });

  const resource2 = await prisma.resource.create({
    data: {
      organizationId: organization.id,
      name: 'Bayu Saputra',
      email: 'bayu@eventflow.demo',
      phone: '+62 813 9876 5432',
      role: 'Admin',
      availability: 'Tersedia kecuali Jumat sore',
      rate: 450000,
      userId: admin.id,
    },
  });

  const resource3 = await prisma.resource.create({
    data: {
      organizationId: organization.id,
      name: 'Citra Lestari',
      email: 'citra@eventflow.demo',
      phone: '+62 811 1111 2222',
      role: 'Anggota',
      availability: 'Tersedia Senin–Kamis',
      userId: member.id,
    },
  });

  // ---- Event (acara) ----
  const startDateTime = new Date('2026-11-02T08:00:00');
  const endDateTime = new Date('2026-11-20T17:00:00');

  const event = await prisma.event.create({
    data: {
      name: 'Acara Tahunan EventFlow 2026',
      description:
        'Acara tahunan organisasi EventFlow yang mencakup perencanaan, persiapan, dan pelaksanaan.',
      location: 'Gedung EventFlow, Lantai 3',
      startDate: startDateTime,
      endDate: endDateTime,
      status: 'planning',
      organizationId: organization.id,
      ownerId: owner.id,
      memberIds: JSON.stringify([owner.id, admin.id, member.id]),
    },
  });

  // ---- Tasks (dengan critical path) ----
  // A: durasi 3
  const taskA = await prisma.task.create({
    data: {
      title: 'Tugas A: Perencanaan awal',
      description: 'Tugas utama perencanaan awal proyek.',
      eventId: event.id,
      startDate: new Date('2026-11-02'),
      durationDays: 3,
      priority: 'high',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: owner.id,
    },
  });

  // B: FS dari A, lag 1, durasi 2
  const taskB = await prisma.task.create({
    data: {
      title: 'Tugas B: Persiapan logistik',
      description: 'Persiapan logistik setelah perencanaan awal selesai + 1 hari kerja.',
      eventId: event.id,
      startDate: new Date('2026-11-09'), // akan dihitung ulang: EF_A = 3 + lag 1 = 4 (work-day) -> ~11 Nov
      durationDays: 2,
      priority: 'high',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: admin.id,
    },
  });

  await prisma.taskDependency.create({
    data: {
      taskId: taskB.id,
      predecessorId: taskA.id,
      type: 'FS',
      lagWorkDays: 1,
    },
  });

  // C: FS dari B, lag 0, durasi 1, milestone
  const taskC = await prisma.task.create({
    data: {
      title: 'Tugas C: Penetapan final',
      description: 'Milestone penetapan final jadwal.',
      eventId: event.id,
      startDate: new Date('2026-11-13'),
      durationDays: 1,
      priority: 'urgent',
      status: 'not_started',
      progress: 0,
      isMilestone: true,
      assigneeId: owner.id,
    },
  });

  await prisma.taskDependency.create({
    data: {
      taskId: taskC.id,
      predecessorId: taskB.id,
      type: 'FS',
      lagWorkDays: 0,
    },
  });

  // D: independent, durasi 2
  const taskD = await prisma.task.create({
    data: {
      title: 'Tugas D: Riset pasar (independent)',
      description: 'Riset pasar yang tidak bergantung pada jadwal utama.',
      eventId: event.id,
      startDate: new Date('2026-11-02'),
      durationDays: 2,
      priority: 'medium',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: member.id,
    },
  });

  // E: FS dari A, lag 0, durasi 1
  const taskE = await prisma.task.create({
    data: {
      title: 'Tugas E: Konfirmasi peserta',
      description: 'Konfirmasi peserta setelah A selesai (tanpa jeda).',
      eventId: event.id,
      startDate: new Date('2026-11-05'),
      durationDays: 1,
      priority: 'medium',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: member2.id,
    },
  });

  await prisma.taskDependency.create({
    data: {
      taskId: taskE.id,
      predecessorId: taskA.id,
      type: 'FS',
      lagWorkDays: 0,
    },
  });

  // F: SS dari A, lag 0, durasi 2
  const taskF = await prisma.task.create({
    data: {
      title: 'Tugas F: Desain materi (SS dari A)',
      description: 'Desain materi dimulai bersamaan dengan A.',
      eventId: event.id,
      startDate: new Date('2026-11-02'),
      durationDays: 2,
      priority: 'medium',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: member.id,
    },
  });

  await prisma.taskDependency.create({
    data: {
      taskId: taskF.id,
      predecessorId: taskA.id,
      type: 'SS',
      lagWorkDays: 0,
    },
  });

  // G: FS dari C, lag 0, durasi 0, milestone akhir
  const taskG = await prisma.task.create({
    data: {
      title: 'Tugas G: Acara utama (milestone akhir)',
      description: 'Milestone akhir: acara utama dilaksanakan.',
      eventId: event.id,
      startDate: new Date('2026-11-16'), // akan dihitung ulang: EF_C = 6 -> tanggal 16 Nov
      durationDays: 0,
      priority: 'urgent',
      status: 'not_started',
      progress: 0,
      isMilestone: true,
      assigneeId: owner.id,
    },
  });

  await prisma.taskDependency.create({
    data: {
      taskId: taskG.id,
      predecessorId: taskC.id,
      type: 'FS',
      lagWorkDays: 0,
    },
  });

  // ---- Subtask hierarki ----
  // Subtask dari taskA (durasi 1, 2 subtugas)
  const subA1 = await prisma.task.create({
    data: {
      title: 'Sub A1: Kumpulkan kebutuhan',
      description: 'Subtugas A1.',
      eventId: event.id,
      parentId: taskA.id,
      startDate: new Date('2026-11-02'),
      durationDays: 1,
      priority: 'high',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: owner.id,
    },
  });

  const subA2 = await prisma.task.create({
    data: {
      title: 'Sub A2: Review kebutuhan',
      description: 'Subtugas A2.',
      eventId: event.id,
      parentId: taskA.id,
      startDate: new Date('2026-11-03'),
      durationDays: 1,
      priority: 'high',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: admin.id,
    },
  });

  // Subtask dari taskB
  const subB1 = await prisma.task.create({
    data: {
      title: 'Sub B1: Pesan venue',
      description: 'Subtugas B1.',
      eventId: event.id,
      parentId: taskB.id,
      startDate: new Date('2026-11-09'),
      durationDays: 1,
      priority: 'high',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: admin.id,
    },
  });

  const subB2 = await prisma.task.create({
    data: {
      title: 'Sub B2: Siapkan catering',
      description: 'Subtugas B2.',
      eventId: event.id,
      parentId: taskB.id,
      startDate: new Date('2026-11-10'),
      durationDays: 1,
      priority: 'medium',
      status: 'not_started',
      progress: 0,
      isMilestone: false,
      assigneeId: member2.id,
    },
  });

  // ---- LeavePeriod (cuti anggota) ----
  await prisma.leavePeriod.create({
    data: {
      resourceId: resource3.id,
      name: 'Cuti tahunan Citra',
      startDate: new Date('2026-11-15'),
      endDate: new Date('2026-11-20'),
    },
  });

  // ---- TaskMember (penugasan) ----
  await prisma.taskMember.createMany({
    data: [
      { taskId: taskA.id, userId: owner.id },
      { taskId: taskA.id, userId: admin.id },
      { taskId: taskB.id, userId: admin.id },
      { taskId: taskB.id, userId: member2.id },
      { taskId: taskC.id, userId: owner.id },
      { taskId: taskD.id, userId: member.id },
      { taskId: taskE.id, userId: member2.id },
      { taskId: taskF.id, userId: member.id },
      { taskId: taskG.id, userId: owner.id },
      { taskId: subA1.id, userId: owner.id },
      { taskId: subA2.id, userId: admin.id },
      { taskId: subB1.id, userId: admin.id },
      { taskId: subB2.id, userId: member2.id },
    ],
    skipDuplicates: true,
  });

  // ---- ResourceAssignment ----
  await prisma.resourceAssignment.createMany({
    data: [
      { resourceId: resource1.id, taskId: taskA.id },
      { resourceId: resource1.id, taskId: taskC.id },
      { resourceId: resource1.id, taskId: taskG.id },
      { resourceId: resource2.id, taskId: taskA.id },
      { resourceId: resource2.id, taskId: taskB.id },
      { resourceId: resource3.id, taskId: taskB.id },
      { resourceId: resource3.id, taskId: taskD.id },
    ],
    skipDuplicates: true,
  });

  // ---- Activity ----
  await prisma.activity.create({
    data: {
      userId: owner.id,
      organizationId: organization.id,
      type: 'event_created',
      description: 'Membuat acara "Acara Tahunan EventFlow 2026".',
      entityId: event.id,
      entityName: event.name,
    },
  });

  await prisma.activity.create({
    data: {
      userId: owner.id,
      organizationId: organization.id,
      type: 'task_created',
      description: 'Membuat tugas "Tugas A: Perencanaan awal".',
      entityId: taskA.id,
      entityName: taskA.title,
    },
  });

  console.log('Seed selesai.');
  console.log('Akun demo:');
  console.log('  - ahmad@eventflow.demo / Demo123!');
  console.log('  - bayu@eventflow.demo / Demo123!');
  console.log('  - citra@eventflow.demo / Demo123!');
  console.log('  - dimas@eventflow.demo / Demo123!');
  console.log('Kode undangan: RAHASIA2026-MEMBER (role member, expires 7 hari)');
}

main()
  .catch((e) => {
    console.error('Seed gagal:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
