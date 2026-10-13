// Reads and validates every setting the API needs, so mistakes in .env are
// reported clearly at startup instead of causing confusing errors later.
import './env.js';
import { z } from 'zod';

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'is required (e.g. postgres://user:password@localhost:5433/fernway_market)'),
    JWT_SECRET: z.string().min(16, 'must be at least 16 characters long'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8081'),

    STORE_NAME: z.string().min(1).default('Fernway Market'),
    STORE_ADDRESS: z.string().default('12 Market Street, Springfield'),
    STORE_PHONE: z.string().default(''),
    CURRENCY: z.string().length(3, 'must be a 3-letter currency code such as INR, USD or GBP').toUpperCase().default('INR'),
    STORE_TIMEZONE: z.string().refine(isValidTimeZone, 'must be a valid IANA time zone such as Europe/London').default('UTC'),

    PICKUP_OPEN_HOUR: z.coerce.number().int().min(0).max(23).default(9),
    PICKUP_CLOSE_HOUR: z.coerce.number().int().min(1).max(24).default(20),
    PICKUP_SLOT_MINUTES: z.coerce.number().int().min(15).max(240).default(60),
    PICKUP_SLOT_CAPACITY: z.coerce.number().int().min(1).max(500).default(6),
    PICKUP_DAYS_AHEAD: z.coerce.number().int().min(0).max(14).default(3),
    PICKUP_LEAD_TIME_MINUTES: z.coerce.number().int().min(0).max(24 * 60).default(60),

    // Where uploaded product photos are kept: "disk" (backend/uploads, fine on your
    // computer) or "database" (survives redeploys on hosts that wipe their disk).
    IMAGE_STORAGE: z.enum(['disk', 'database']).default('disk'),
    // Allow sample data even when NODE_ENV=production (for demo deployments only).
    LOAD_SAMPLE_DATA: z
      .string()
      .optional()
      .transform((value) => value === 'true' || value === '1'),

    SEED_STAFF_EMAIL: z.string().optional(),
    SEED_STAFF_PASSWORD: z.string().optional(),
    SEED_CUSTOMER_EMAIL: z.string().optional(),
    SEED_CUSTOMER_PASSWORD: z.string().optional(),
  })
  .refine((c) => c.PICKUP_CLOSE_HOUR > c.PICKUP_OPEN_HOUR, {
    message: 'must be later than PICKUP_OPEN_HOUR',
    path: ['PICKUP_CLOSE_HOUR'],
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌ Some settings in your .env file are missing or invalid:\n');
  for (const issue of parsed.error.issues) {
    console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n   Tip: run "npm run setup" in the project folder to create .env from .env.example.\n');
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && /replace|change-me|changeme/i.test(env.JWT_SECRET)) {
  console.error('❌ JWT_SECRET still has a placeholder value. Set a long random secret before running in production.');
  process.exit(1);
}

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export type Config = typeof config;
