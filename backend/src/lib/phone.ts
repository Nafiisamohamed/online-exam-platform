/**
 * Somali phone numbers.
 *
 * Stored in international format: "+252" followed by 9 digits, the first
 * being 6 or 7 for mobile numbers (e.g. +252615123401). Operator prefixes are
 * not checked, because a wrong prefix list would block valid numbers.
 */
const SOMALI_MOBILE = /^\+252[67]\d{8}$/;

/** Accepts "+252 61 512 3401", "00252615123401", "252615123401" or "0615123401" and returns "+252615123401", or null. */
export function normalizeSomaliPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (/^252\d{9}$/.test(digits)) digits = "+" + digits;
  if (/^0[67]\d{8}$/.test(digits)) digits = "+252" + digits.slice(1);
  if (/^[67]\d{8}$/.test(digits)) digits = "+252" + digits;
  return SOMALI_MOBILE.test(digits) ? digits : null;
}

/** True for a normalised Somali mobile number (+2526XXXXXXXX or +2527XXXXXXXX). */
export function isSomaliMobile(phone: string): boolean {
  return SOMALI_MOBILE.test(phone);
}
