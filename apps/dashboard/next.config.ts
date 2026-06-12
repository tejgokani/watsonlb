import type { NextConfig } from "next";

// Both env vars point to the same Render proxy in production
const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
const proxyUrl = process.env["NEXT_PUBLIC_PROXY_URL"] ?? "http://localhost:3001";
const connectSrcHosts = [...new Set([apiUrl, proxyUrl])].join(" ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed by Next.js dev; tighten in prod
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      `connect-src 'self' ${connectSrcHosts}`,
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // standalone only for Docker/Render builds; Vercel handles its own output
  output: process.env["VERCEL"] ? undefined : "standalone",
  transpilePackages: ["@watsonlb/shared"],
  experimental: {
    optimizePackageImports: ["@watsonlb/shared"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
