/**
 * Client IP address and campus network (CIDR) checks (section 4.5: exams can
 * be limited to allowed rooms or network addresses).
 */
import type { Request } from "express";
import { BlockList, isIP } from "node:net";

/** The client's IP address, with IPv4-mapped IPv6 ("::ffff:10.0.0.5") shortened to IPv4. */
export function clientIp(req: Request): string {
  const raw = req.ip || req.socket?.remoteAddress || "";
  return normalizeIp(raw);
}

/** Shortens an IPv4-mapped IPv6 address ("::ffff:10.0.0.5") to plain IPv4; other values are returned unchanged. */
export function normalizeIp(raw: string): string {
  return raw.startsWith("::ffff:") && isIP(raw.slice(7)) === 4 ? raw.slice(7) : raw;
}

/** True when `cidr` is a valid IPv4 or IPv6 range such as "10.10.4.0/24". */
export function isValidCidr(cidr: string): boolean {
  const m = /^(.+)\/(\d{1,3})$/.exec(cidr.trim());
  if (!m) return false;
  const family = isIP(m[1]);
  const prefix = Number(m[2]);
  return (family === 4 && prefix <= 32) || (family === 6 && prefix <= 128);
}

/** True when `ip` is inside at least one of the ranges. Invalid ranges are ignored. */
export function ipInRanges(ip: string, ranges: string[]): boolean {
  const addr = normalizeIp(ip);
  const family = isIP(addr);
  if (!family) return false;
  const list = new BlockList();
  for (const r of ranges) {
    if (!isValidCidr(r)) continue;
    const [base, prefix] = r.trim().split("/");
    list.addSubnet(base, Number(prefix), isIP(base) === 4 ? "ipv4" : "ipv6");
  }
  return list.check(addr, family === 4 ? "ipv4" : "ipv6");
}
