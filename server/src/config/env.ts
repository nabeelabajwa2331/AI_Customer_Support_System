import { z } from 'zod';

// Empty values (e.g. `KEY=` in a .env file) mean "not set".
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const provider = z.enum(['ollama', 'openai-compatible']);

// Validated at startup so the rest of the code can rely on typed values.
const envSchema = z
  .object({
    NODE_ENV: z.string().trim().default('development'),
    // Port 5001 avoids a common local conflict with other apps using 5000.
    PORT: z.coerce.number().int().min(1).max(65535).default(5001),

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
    // The database column is vector(768), so every provider must return 768 values.
    EMBEDDING_DIMENSIONS: z.coerce
      .number()
      .int()
      .positive()
      .default(768)
      .refine((value) => value === 768, {
        message: 'EMBEDDING_DIMENSIONS must be 768 to match the database vector(768) column.',
      }),

    // AI providers. "ollama" runs models locally; "openai-compatible" calls a
    // hosted API (Groq, Gemini, OpenAI, ...). Chat and embeddings are separate
    // because some providers (e.g. Groq) offer only one of them.
    CHAT_PROVIDER: z.preprocess(emptyToUndefined, provider.default('ollama')),
    EMBEDDING_PROVIDER: z.preprocess(emptyToUndefined, provider.default('ollama')),

    CHAT_API_BASE_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .url('CHAT_API_BASE_URL must be a valid URL')
        .default('https://api.groq.com/openai/v1'),
    ),
    CHAT_API_KEY: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    CHAT_API_MODEL: z.preprocess(
      emptyToUndefined,
      z.string().trim().default('llama-3.1-8b-instant'),
    ),

    EMBEDDING_API_BASE_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .url('EMBEDDING_API_BASE_URL must be a valid URL')
        .default('https://generativelanguage.googleapis.com/v1beta/openai'),
    ),
    EMBEDDING_API_KEY: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    EMBEDDING_API_MODEL: z.preprocess(
      emptyToUndefined,
      z.string().trim().default('gemini-embedding-001'),
    ),
    // Ask the provider for 768-dimension vectors. Disable only for a model that
    // natively returns 768 and rejects the parameter.
    EMBEDDING_API_SEND_DIMENSIONS: z.preprocess(
      emptyToUndefined,
      z
        .enum(['true', 'false'])
        .default('true')
        .transform((value) => value === 'true'),
    ),
    AI_API_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(30_000),

    // Browser origins allowed to call the API (comma-separated), e.g. the Vercel
    // URL. Empty means same-origin only (local development uses the Vite proxy).
    CORS_ORIGINS: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .optional()
        .transform((value) =>
          (value ?? '')
            .split(',')
            .map((origin) => origin.trim().replace(/\/+$/, ''))
            .filter(Boolean),
        )
        .refine((origins) => origins.every((origin) => /^https?:\/\/[^/\s]+$/.test(origin)), {
          message: 'CORS_ORIGINS must be comma-separated origins like https://app.example.com',
        }),
    ),

    // Number of reverse proxies in front of the app (1 on Render), so rate
    // limits see the real client IP. 0 = trust none (local development).
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(30_000),
    // Chat generation needs a longer limit than embeddings: loading the chat
    // model from cold took ~25-35s on CPU-only hardware, which exceeded 30s.
    OLLAMA_CHAT_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(120_000),

    // Minimum retrieval similarity (1 - cosine distance) a chunk needs before the
    // chat layer sends it to the model. Provisional value from a small evaluation;
    // it filters clearly off-topic questions but does not prove answerability.
    // An empty value falls back to the default instead of coercing to 0, which
    // would silently disable the gate.
    CHAT_MIN_SIMILARITY: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.coerce
        .number()
        .min(0, 'CHAT_MIN_SIMILARITY must be between 0 and 1')
        .max(1, 'CHAT_MIN_SIMILARITY must be between 0 and 1')
        .default(0.4),
    ),

    // Per-user limits for expensive routes. Raise temporarily for evaluation runs.
    CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(10),
    UPLOAD_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(20),

    // OAuth client ID for "Continue with Google" (public, not a secret). Unset or
    // empty disables Google sign-in.
    GOOGLE_CLIENT_ID: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .regex(
          /\.apps\.googleusercontent\.com$/,
          'GOOGLE_CLIENT_ID must end with .apps.googleusercontent.com',
        )
        .optional(),
    ),

    // JWT signing secret (>=32 chars).
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),

    // Short-lived access token; refresh tokens are stored server-side and revocable.
    JWT_EXPIRES_IN: z.string().trim().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

    // bcrypt cost factor. 12 is a good 2020s default on modern hardware.
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    LOG_LEVEL: z.string().trim().default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.CHAT_PROVIDER === 'openai-compatible' && !env.CHAT_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['CHAT_API_KEY'],
        message: 'CHAT_API_KEY is required when CHAT_PROVIDER=openai-compatible',
      });
    }
    if (env.EMBEDDING_PROVIDER === 'openai-compatible' && !env.EMBEDDING_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMBEDDING_API_KEY'],
        message: 'EMBEDDING_API_KEY is required when EMBEDDING_PROVIDER=openai-compatible',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

export type AiProvider = z.infer<typeof provider>;

export interface HostedApiConfig {
  readonly baseUrl: string;
  /** Only set when the provider is openai-compatible. Never log it. */
  readonly apiKey: string | null;
  readonly timeoutMs: number;
}

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
  readonly ollamaChatTimeoutMs: number;
  readonly chatProvider: AiProvider;
  readonly embeddingProvider: AiProvider;
  /** Model name for the active chat provider. */
  readonly chatModel: string;
  /** Model name for the active embedding provider. */
  readonly embeddingModel: string;
  readonly chatApi: HostedApiConfig;
  readonly embeddingApi: HostedApiConfig & { sendDimensions: boolean };
  readonly corsOrigins: readonly string[];
  readonly trustProxy: number;
  readonly chatMinSimilarity: number;
  readonly chatRateLimitPerMinute: number;
  readonly uploadRateLimitPerHour: number;
  readonly googleClientId: string | null;
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
  ollamaChatTimeoutMs: env.OLLAMA_CHAT_TIMEOUT_MS,
  chatProvider: env.CHAT_PROVIDER,
  embeddingProvider: env.EMBEDDING_PROVIDER,
  chatModel: env.CHAT_PROVIDER === 'ollama' ? env.OLLAMA_CHAT_MODEL : env.CHAT_API_MODEL,
  embeddingModel:
    env.EMBEDDING_PROVIDER === 'ollama' ? env.OLLAMA_EMBEDDING_MODEL : env.EMBEDDING_API_MODEL,
  chatApi: Object.freeze({
    baseUrl: env.CHAT_API_BASE_URL,
    apiKey: env.CHAT_API_KEY ?? null,
    timeoutMs: env.AI_API_TIMEOUT_MS,
  }),
  embeddingApi: Object.freeze({
    baseUrl: env.EMBEDDING_API_BASE_URL,
    apiKey: env.EMBEDDING_API_KEY ?? null,
    timeoutMs: env.AI_API_TIMEOUT_MS,
    sendDimensions: env.EMBEDDING_API_SEND_DIMENSIONS,
  }),
  corsOrigins: Object.freeze([...env.CORS_ORIGINS]),
  trustProxy: env.TRUST_PROXY,
  chatMinSimilarity: env.CHAT_MIN_SIMILARITY,
  chatRateLimitPerMinute: env.CHAT_RATE_LIMIT_PER_MINUTE,
  uploadRateLimitPerHour: env.UPLOAD_RATE_LIMIT_PER_HOUR,
  googleClientId: env.GOOGLE_CLIENT_ID ?? null,
  authSecret: env.AUTH_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  bcryptRounds: env.BCRYPT_ROUNDS,
  logLevel: env.LOG_LEVEL,
});

export const isProduction = config.nodeEnv === 'production';
export const isTest = config.nodeEnv === 'test';
