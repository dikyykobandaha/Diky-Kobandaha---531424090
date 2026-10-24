import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().default(604800),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  DISABLE_CSRF: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Jakarta'),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  return envSchema.parse({
    NODE_ENV: (process.env.NODE_ENV as any) || 'development',
    PORT: process.env.PORT || '3000',
    HOST: process.env.HOST || '0.0.0.0',
    DATABASE_URL: process.env.DATABASE_URL || '',
    SESSION_SECRET: process.env.SESSION_SECRET || '',
    SESSION_MAX_AGE_SECONDS: parseInt(process.env.SESSION_MAX_AGE_SECONDS || '604800', 10),
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    DISABLE_CSRF: (process.env.DISABLE_CSRF as any) || 'false',
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta',
  });
}

export function validateEnv() {
  try {
    const env = getEnv();
    return env;
  } catch (error) {
    console.error('Environment tidak valid:', error);
    process.exit(1);
  }
}
