import 'dotenv/config'
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

  /**
   * Signing key for access tokens. No default in production — a fallback secret
   * that ships in the image is the same as no signature at all.
   *
   * 32 bytes minimum because HS256 with a short key is brute-forceable offline;
   * an attacker who has one valid token has everything needed to try.
   */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  /** Access token lifetime. Short by design — the refresh token is the long one. */
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),

  /** Refresh token lifetime, and therefore "stay logged in" duration. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** Password reset link lifetime. */
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),

  /** bcrypt cost. Plan requires >= 12; the schema enforces it rather than trusting the .env. */
  BCRYPT_ROUNDS: z.coerce.number().int().min(12).max(15).default(12),

  /**
   * SameSite policy for the refresh cookie.
   *
   * The plan specifies `Strict`, which is right when the API and the app share a
   * site. This deployment does not: the frontend is on `*.vercel.app` and the
   * API on `*.onrender.com`, and the public suffix list makes those different
   * sites — so a Strict or Lax cookie is simply never sent on the refresh call
   * and every session dies at the 15-minute mark.
   *
   * `none` is therefore required in production *as currently deployed*, and it
   * costs the browser's built-in CSRF protection — which `verifyOrigin` on the
   * cookie-authenticated routes replaces. If the API later moves to a subdomain
   * of the app's own domain, set this back to `strict` and that trade goes away.
   */
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).optional(),

  /** Set only when API and frontend share a parent domain. */
  COOKIE_DOMAIN: z.string().optional(),

  /** Public origin of the frontend. Used to build password reset links. */
  APP_URL: z.string().url().default('http://localhost:5173'),

  /** When set, password reset mail goes out via Resend instead of the log. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Saulado <onboarding@resend.dev>'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\nCopy backend/.env.example to backend/.env and fill it in.`,
  )
}

const data = parsed.data
const isProduction = data.NODE_ENV === 'production'

export const env = {
  ...data,
  isProduction,
  isTest: data.NODE_ENV === 'test',

  /** CORS_ORIGIN is comma-separated to allow a staging + local origin at once. */
  corsOrigins: data.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Defaults differ by environment because the topology does.
   *
   * Dev goes through the Vite proxy, so the browser is same-origin and `lax`
   * works while keeping CSRF protection. Production is cross-site, where only
   * `none` is delivered at all.
   */
  cookieSameSite: data.COOKIE_SAMESITE ?? (isProduction ? 'none' : 'lax'),

  /**
   * `SameSite=None` is rejected by browsers without `Secure`, so this is not
   * merely a good idea — an insecure None cookie is dropped silently.
   */
  cookieSecure: isProduction || (data.COOKIE_SAMESITE ?? '') === 'none',
} as const
