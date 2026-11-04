/**
 * Builds node-postgres (pg) connection settings from a database URL.
 *
 * Why: the URLs in backend/.env are written for the Prisma CLI. Node's pg driver
 * reads some of the same parameters differently. In particular it treats
 * sslmode=require as "verify the certificate", and Supabase's certificates are
 * signed by Supabase's own root CA, which Node does not trust by default.
 *
 * What it does:
 * - removes Prisma-only parameters (schema, sslmode, sslcert, sslaccept,
 *   connect_timeout, pgbouncer) from the URL;
 * - for Supabase hosts: verifies the server certificate against Supabase's root
 *   CA in backend/certs/supabase-ca-2021.crt (full verification, never disabled);
 * - for other hosts: uses TLS only when the URL asks for it (sslmode other than
 *   "disable"), verifying for verify-ca / verify-full.
 *
 * @param {string} url  PostgreSQL connection URL
 * @returns {{ connectionString: string, ssl: false | object, connectionTimeoutMillis: number }}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SUPABASE_CA_FILE = path.join(backendDir, "certs", "supabase-ca-2021.crt");

const PRISMA_ONLY_PARAMS = ["schema", "sslmode", "sslcert", "sslaccept", "sslrootcert", "connect_timeout", "pgbouncer", "uselibpqcompat"];

export function isSupabaseHost(hostname) {
  const h = hostname.toLowerCase();
  return h.endsWith(".supabase.com") || h.endsWith(".supabase.co");
}

export function pgClientConfig(url) {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  for (const p of PRISMA_ONLY_PARAMS) u.searchParams.delete(p);

  let ssl = false;
  if (isSupabaseHost(u.hostname)) {
    ssl = { ca: fs.readFileSync(SUPABASE_CA_FILE, "utf8"), rejectUnauthorized: true, servername: u.hostname };
  } else if (sslmode && sslmode !== "disable") {
    ssl = { rejectUnauthorized: sslmode === "verify-ca" || sslmode === "verify-full" };
  }
  return { connectionString: u.toString(), ssl, connectionTimeoutMillis: 30_000 };
}
