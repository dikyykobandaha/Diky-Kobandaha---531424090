import { z } from 'zod';

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Nama minimal 2 karakter.')
    .max(100, 'Nama terlalu panjang.'),
  email: z
    .string()
    .email('Format email tidak valid.')
    .toLowerCase()
    .max(255, 'Email terlalu panjang.'),
  password: z
    .string()
    .min(8, 'Kata sandi minimal 8 karakter.')
    .max(128, 'Kata sandi terlalu panjang.'),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email('Format email tidak valid.')
    .toLowerCase()
    .max(255),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
  newPassword: z
    .string()
    .min(8, 'Kata sandi baru minimal 8 karakter.')
    .max(128, 'Kata sandi baru terlalu panjang.'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
