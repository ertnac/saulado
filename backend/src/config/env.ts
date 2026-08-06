import { z } from 'zod'

/**
 * Fail fast and loudly on bad config. A missing DATABASE_URL should crash at
 * boot with a readable message, not surface as an obscure Prisma error on the
 * first request.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\nCopy backend/.env.example to backend/.env and fill it in.`,
  )
}

export const env = {
  ...parsed.data,
  /** CORS_ORIGIN is comma-separated to allow a staging + local origin at once. */
  corsOrigins: parsed.data.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
} as const
