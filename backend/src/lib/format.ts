/**
 * Small conversion helpers for API responses.
 *
 * Money and marks are DECIMAL in the database (never floating point). They are
 * converted to JSON numbers only at the edge, rounded to 2 decimals.
 */
import { Prisma } from "../generated/prisma/client.ts";

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

/** Decimal -> number with 2 decimals; null stays null. */
export function num(value: DecimalLike): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value.toString()) * 100) / 100;
}

/** Decimal -> number, treating null as 0. */
export function num0(value: DecimalLike): number {
  return num(value) ?? 0;
}

/** Decimal from a number or string (for writing). */
export function dec(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Lowercase, trim and collapse repeated spaces (D19 duplicate check, D20 short-answer matching). Punctuation is kept. */
export function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Standard paginated list shape. */
export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize };
}
