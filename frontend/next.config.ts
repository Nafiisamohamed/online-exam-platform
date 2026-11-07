import type { NextConfig } from "next";

/**
 * The browser only talks to the Next.js server; /api/* is forwarded to the
 * Express API. One origin keeps the HTTP-only, SameSite=Strict session cookie
 * working without cross-site requests. BACKEND_URL is the API's address
 * (default http://localhost:4000 for development and the campus server).
 */
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

/** Browser hardening for every page (the API sets its own headers with helmet). */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
