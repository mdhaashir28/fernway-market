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

/** An optional key or secret. Values copied from .env.example ("replace-with-…") count as not set. */
const optionalCredential = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && !/replace-with/i.test(value) ? value : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'is required (e.g. postgres://user:password@localhost:5433/fernway_market)'),
    JWT_SECRET: z.string().min(16, 'must be at least 16 characters long'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8081'),

    STORE_NAME: z.string().min(1).default('Meeranji Supermarket'),
    STORE_ADDRESS: z.string().default('#78/153 Bazaar Street, Pernambut - 635 810, Vellore District, Tamil Nadu'),
    // One or more numbers, separated by commas.
    STORE_PHONE: z.string().default('9789562928, 9003071616'),
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

    // The API's public address, used in payment links (e.g. https://meeranji-api.vercel.app).
    // Optional: when empty it is worked out from each request.
    PUBLIC_API_URL: z.string().optional(),

    // --- UPI payments --------------------------------------------------------
    // "demo" = clearly labelled practice payments, no money moves (default).
    // "razorpay" = UPI through Razorpay's checkout. With TEST keys (rzp_test_…) no real
    // money moves; LIVE keys (rzp_live_…) are refused unless RAZORPAY_ALLOW_LIVE_PAYMENTS=true.
    // Without keys, the clearly labelled demo page is used instead.
    PAYMENTS_MODE: z.enum(['demo', 'razorpay']).default('demo'),
    RAZORPAY_KEY_ID: optionalCredential,
    RAZORPAY_KEY_SECRET: optionalCredential,
    RAZORPAY_WEBHOOK_SECRET: optionalCredential,
    // Live payments charge real customers' money. Leave this off for demos and testing.
    RAZORPAY_ALLOW_LIVE_PAYMENTS: z
      .string()
      .optional()
      .transform((value) => value === 'true'),
    // Unpaid UPI orders are cancelled (and their stock released) after this many minutes.
    PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(120).default(15),

    // --- WhatsApp order updates (official WhatsApp Business Platform / Cloud API) ---
    // "demo" = messages are only recorded and previewed in the dashboard (default).
    // "cloud_api" = sent through Meta's Cloud API (needs the settings below). "off" = none.
    WHATSAPP_MODE: z.enum(['off', 'demo', 'cloud_api']).default('demo'),
    WHATSAPP_ACCESS_TOKEN: optionalCredential,
    WHATSAPP_PHONE_NUMBER_ID: optionalCredential,
    WHATSAPP_APP_SECRET: optionalCredential,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalCredential,
    WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'must look like v26.0').default('v26.0'),
    WHATSAPP_TEMPLATE_PREFIX: z.string().default(''),
    WHATSAPP_TEMPLATE_LANG_EN: z.string().default('en'),
    WHATSAPP_TEMPLATE_LANG_TA: z.string().default('ta'),
    // Number customers can message for help ("Chat on WhatsApp" link). Defaults to the first STORE_PHONE.
    STORE_WHATSAPP_NUMBER: z.string().optional(),
  })
  .refine((c) => c.PICKUP_CLOSE_HOUR > c.PICKUP_OPEN_HOUR, {
    message: 'must be later than PICKUP_OPEN_HOUR',
    path: ['PICKUP_CLOSE_HOUR'],
  })
  .refine((c) => !c.RAZORPAY_KEY_ID || /^rzp_(test|live)_/.test(c.RAZORPAY_KEY_ID), {
    message: 'must start with rzp_test_ (test mode) or rzp_live_ (live mode) — copy it from Razorpay Dashboard → API Keys',
    path: ['RAZORPAY_KEY_ID'],
  })
  .refine((c) => !(c.PAYMENTS_MODE === 'razorpay' && c.RAZORPAY_KEY_ID?.startsWith('rzp_live_') && !c.RAZORPAY_ALLOW_LIVE_PAYMENTS), {
    message:
      'is a LIVE key (rzp_live_…). Live payments charge real money, so they stay off unless you set RAZORPAY_ALLOW_LIVE_PAYMENTS=true ' +
      'after the go-live checklist in docs/INTEGRATIONS.md. For a demo, use TEST keys (rzp_test_…).',
    path: ['RAZORPAY_KEY_ID'],
  })
  .refine((c) => c.WHATSAPP_MODE !== 'cloud_api' || (c.WHATSAPP_ACCESS_TOKEN && c.WHATSAPP_PHONE_NUMBER_ID), {
    message: 'WHATSAPP_MODE=cloud_api needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID',
    path: ['WHATSAPP_MODE'],
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌ Some settings (in .env, or your host\'s environment variables) are missing or invalid:\n');
  for (const issue of parsed.error.issues) {
    console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error(
    process.env.RENDER
      ? '\n   Fix them in Render → this service → Environment, then deploy again.\n'
      : '\n   Tip: run "npm run setup" in the project folder to create .env from .env.example.\n',
  );
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && /replace|change-me|changeme/i.test(env.JWT_SECRET)) {
  console.error('❌ JWT_SECRET still has a placeholder value. Set a long random secret before running in production.');
  process.exit(1);
}

/**
 * How UPI payments behave right now:
 *   demo — the clearly labelled practice page (PAYMENTS_MODE=demo, or Razorpay keys not set)
 *   test — Razorpay checkout with TEST keys: no real money
 *   live — Razorpay with LIVE keys: real money (only with RAZORPAY_ALLOW_LIVE_PAYMENTS=true)
 */
export type PaymentsEnvironment = 'demo' | 'test' | 'live';
const razorpayKeysSet = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
const paymentsEnvironment: PaymentsEnvironment =
  env.PAYMENTS_MODE !== 'razorpay' || !razorpayKeysSet ? 'demo' : env.RAZORPAY_KEY_ID!.startsWith('rzp_live_') ? 'live' : 'test';

export const config = {
  ...env,
  paymentsEnvironment,
  /** PAYMENTS_MODE=razorpay but the keys are missing (the demo page is used instead). */
  razorpayKeysMissing: env.PAYMENTS_MODE === 'razorpay' && !razorpayKeysSet,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // On Render, RENDER_EXTERNAL_URL (e.g. https://meeranji-api.onrender.com) is set automatically.
  PUBLIC_API_URL: (env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL)?.replace(/\/+$/, '') || undefined,
};

export type Config = typeof config;
