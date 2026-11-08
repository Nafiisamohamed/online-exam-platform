/**
 * Application settings, read once from the environment (backend/.env).
 *
 * Every setting is validated at startup with zod. The server refuses to start
 * when a required value is missing or unsafe, for example:
 * - JWT_SECRET shorter than 32 characters;
 * - PAYMENT_MODE or SMS_MODE set to anything other than "simulated" (the brief
 *   forbids real payment and SMS providers);
 * - DEFAULT_CURRENCY not in SUPPORTED_CURRENCIES.
 *
 * Exports `env`, a frozen, typed object. Import it instead of reading
 * process.env directly anywhere else in the code.
 */
import "dotenv/config";
import { z } from "zod";

const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

const currencyList = z
  .string()
  .default("USD,SOS")
  .transform((s) => s.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))
  .pipe(z.array(z.string().regex(/^[A-Z]{3}$/, "3-letter ISO currency code")).min(1));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    /** Restricted application role (exam_app). Never the database owner. */
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required (the exam_app connection)"),

    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    /** Login session length, e.g. "8h" (a full exam day). */
    JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'use a value such as "8h"').default("8h"),
    /** Send the session cookie only over HTTPS. Defaults to true in production. */
    COOKIE_SECURE: z.enum(["true", "false"]).optional(),
    /** The frontend address allowed to call the API with cookies (comma-separated). */
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    /** Set when the API runs behind a reverse proxy, so the client IP is read correctly. */
    TRUST_PROXY: bool(false),

    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    /** Q1: temporary passwords for imported students expire after this many days. */
    TEMP_PASSWORD_DAYS: z.coerce.number().int().min(1).max(30).default(7),

    /** Section 7: payments and SMS are simulated only. No other value is accepted. */
    PAYMENT_MODE: z.literal("simulated", { message: 'PAYMENT_MODE must be "simulated"' }).default("simulated"),
    SMS_MODE: z.literal("simulated", { message: 'SMS_MODE must be "simulated"' }).default("simulated"),
    /** The one PIN accepted by the simulated mobile-money screen. Not a real PIN. */
    DEMO_PAYMENT_PIN: z.string().regex(/^\d{4,6}$/, "DEMO_PAYMENT_PIN must be 4-6 digits"),
    PAYMENT_MERCHANT_NAME: z.string().min(1).default("Online Examination System"),
    PAYMENT_MERCHANT_NUMBER: z.string().min(1).default("000000"),
    SMS_SENDER_ID: z.string().min(1).max(20).default("ONLINE-EXAM-SYSTEM"),

    /** P9: exam fee currencies. */
    DEFAULT_CURRENCY: z.string().regex(/^[A-Z]{3}$/).default("USD"),
    SUPPORTED_CURRENCIES: currencyList,

    /** Folder for uploaded question images (kept out of git). */
    UPLOAD_DIR: z.string().default("uploads"),
    /** Time zone used for dates printed in SMS messages and PDFs. */
    APP_TIMEZONE: z.string().default("Africa/Mogadishu"),

    /** Background jobs (auto-submit, payment expiry, SMS status). Off in tests. */
    JOBS_ENABLED: bool(true),
    JOB_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  })
  .superRefine((v, ctx) => {
    if (!v.SUPPORTED_CURRENCIES.includes(v.DEFAULT_CURRENCY)) {
      ctx.addIssue({ code: "custom", path: ["DEFAULT_CURRENCY"], message: "must be one of SUPPORTED_CURRENCIES" });
    }
  });

/** Reads and validates the settings. Throws with a readable list of problems. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid backend settings (see backend/.env.example):\n${problems}`);
  }
  const v = parsed.data;
  return Object.freeze({
    ...v,
    COOKIE_SECURE: v.COOKIE_SECURE === undefined ? v.NODE_ENV === "production" : v.COOKIE_SECURE === "true",
    CORS_ORIGINS: v.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
    isTest: v.NODE_ENV === "test",
  });
}

export type Env = ReturnType<typeof loadEnv>;

export const env: Env = loadEnv();
