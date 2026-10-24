import { PrismaClient } from '@prisma/client';
import { expect } from 'vitest';

// Buat instance Prisma global untuk test
global.prisma = new PrismaClient();

// Hook cleanup setelah setiap tes
const originalExpect = expect;

// Tambahkan matcher kustom jika diperlukan
// originalExpect.extend({
//   toBeValidDate(received) {
//     // implementasi jika perlu
//   },
// });

// Cleanup database setelah semua tes selesai
afterAll(async () => {
  await global.prisma.$disconnect();
});
