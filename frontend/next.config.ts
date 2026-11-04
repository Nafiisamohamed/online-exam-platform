import type { NextConfig } from "next";

/**
 * The browser only talks to the Next.js server; /api/* is forwarded to the
 * Express API. One origin keeps the HTTP-only, SameSite=Strict session cookie
 * working without cross-site requests. BACKEND_URL is the API's address
 * (default http://localhost:4000 for development and the campus server).
 */
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

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
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
