import { z } from 'zod';

// Validated at startup so the rest of the code can rely on typed values.
const envSchema = z.object({
  NODE_ENV: z.string().trim().default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  // PostgreSQL connection string used by Prisma.
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),

  // JWT signing secret (>=32 chars).
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),

  // Short-lived access token; refresh tokens are stored server-side and revocable.
  JWT_EXPIRES_IN: z.string().trim().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  // bcrypt cost factor. 12 is a good 2020s default on modern hardware.
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  LOG_LEVEL: z.string().trim().default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

export interface AppConfig {
  readonly serviceName: string;
  readonly nodeEnv: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly authSecret: string;
  readonly jwtExpiresIn: string;
  readonly refreshTokenTtlDays: number;
  readonly bcryptRounds: number;
  readonly logLevel: string;
}

export const config: AppConfig = Object.freeze({
  serviceName: 'ai-customer-support-api',
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  authSecret: env.AUTH_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  bcryptRounds: env.BCRYPT_ROUNDS,
  logLevel: env.LOG_LEVEL,
});

export const isProduction = config.nodeEnv === 'production';
export const isTest = config.nodeEnv === 'test';
