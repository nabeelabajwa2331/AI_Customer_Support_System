import { z } from 'zod';

// Validated at startup so the rest of the code can rely on typed values.
const envSchema = z.object({
  NODE_ENV: z.string().trim().default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  // PostgreSQL connection string used by Prisma.
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),

  // Local Ollama server used for embeddings. The chat model is reserved for the
  // later RAG chat layer.
  OLLAMA_BASE_URL: z
    .string()
    .trim()
    .url('OLLAMA_BASE_URL must be a valid URL')
    .default('http://localhost:11434'),
  OLLAMA_CHAT_MODEL: z
    .string()
    .trim()
    .min(1, 'OLLAMA_CHAT_MODEL is required')
    .default('qwen2.5:3b'),
  OLLAMA_EMBEDDING_MODEL: z
    .string()
    .trim()
    .min(1, 'OLLAMA_EMBEDDING_MODEL is required')
    .default('embeddinggemma'),
  // embeddinggemma produces 768-dimensional vectors.
  EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(768)
    .refine((value) => value === 768, {
      message: 'EMBEDDING_DIMENSIONS must be 768 for embeddinggemma.',
    }),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(30_000),

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
  readonly ollamaBaseUrl: string;
  readonly ollamaChatModel: string;
  readonly ollamaEmbeddingModel: string;
  readonly embeddingDimensions: number;
  readonly ollamaTimeoutMs: number;
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
  ollamaBaseUrl: env.OLLAMA_BASE_URL,
  ollamaChatModel: env.OLLAMA_CHAT_MODEL,
  ollamaEmbeddingModel: env.OLLAMA_EMBEDDING_MODEL,
  embeddingDimensions: env.EMBEDDING_DIMENSIONS,
  ollamaTimeoutMs: env.OLLAMA_TIMEOUT_MS,
  authSecret: env.AUTH_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  bcryptRounds: env.BCRYPT_ROUNDS,
  logLevel: env.LOG_LEVEL,
});

export const isProduction = config.nodeEnv === 'production';
export const isTest = config.nodeEnv === 'test';
