/**
 * Mobile-money adapter (section 7: payments are simulated through a clean
 * adapter interface, separate from the business logic).
 *
 * PaymentService (modules/payments) owns the business rules: the status flow,
 * amounts copied from the exam, ownership, duplicates and the 3-PIN limit. It
 * talks to a provider only through the MobileMoneyProvider interface below.
 *
 * Only the simulated implementation exists. It never makes a network call,
 * never moves money, and accepts only DEMO_PAYMENT_PIN from .env. The PIN is
 * compared with crypto.timingSafeEqual, so a near-miss takes as long to reject
 * as a completely wrong PIN. The PIN is never stored or logged.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.ts";
import type { PaymentProvider } from "../generated/prisma/enums.ts";

export interface AuthorizeResult {
  ok: boolean;
  /** Provider transaction reference (simulated), set when ok. */
  reference?: string;
}

export interface MobileMoneyProvider {
  /** The provider this adapter handles. */
  readonly provider: PaymentProvider;
  /** Checks the PIN the customer entered on the (simulated) phone prompt. */
  authorize(pin: string): Promise<AuthorizeResult>;
  /** Short code used in receipt numbers: EVC, ZAAD or EDAHAB. */
  readonly receiptCode: string;
}

const RECEIPT_CODES: Record<PaymentProvider, string> = { EVC_PLUS: "EVC", ZAAD: "ZAAD", EDAHAB: "EDAHAB" };
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random upper-case code, e.g. "7F3K9Q". */
export function randomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Constant-time comparison of two PINs (hashing first makes the lengths equal). */
export function pinMatches(entered: string, expected: string): boolean {
  const a = createHash("sha256").update(entered).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Simulated EVC Plus, Zaad or eDahab. All three share the same behaviour. */
export class SimulatedMobileMoney implements MobileMoneyProvider {
  readonly receiptCode: string;
  constructor(readonly provider: PaymentProvider) {
    this.receiptCode = RECEIPT_CODES[provider];
  }

  async authorize(pin: string): Promise<AuthorizeResult> {
    if (!pinMatches(pin, env.DEMO_PAYMENT_PIN)) return { ok: false };
    return { ok: true, reference: `MOCK-${randomCode(8)}` };
  }
}

/** Returns the adapter for a provider. PAYMENT_MODE is always "simulated" (checked at startup). */
export function mobileMoneyFor(provider: PaymentProvider): MobileMoneyProvider {
  return new SimulatedMobileMoney(provider);
}

/** Receipt number in the format checked by the database: DEMO-<EVC|ZAAD|EDAHAB>-YYYYMMDD-XXXXXX. */
export function makeReceiptNumber(adapter: MobileMoneyProvider, at: Date): string {
  const ymd = at.toISOString().slice(0, 10).replace(/-/g, "");
  return `DEMO-${adapter.receiptCode}-${ymd}-${randomCode(6)}`;
}
