import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    // Book PDF uploads (admin/books/[id]/ingestions) allow files up to
    // MAX_BOOK_PDF_BYTES (250MB, see lib/book-storage.ts). Next.js buffers
    // the request body in memory when proxying to the route handler and
    // silently truncates it at 10MB by default — raise that ceiling above
    // the app's own limit so large book PDFs aren't cut off mid-upload.
    middlewareClientMaxBodySize: "260mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-XSS-Protection",
            value: "0",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.google.com https://*.azure.com https://*.microsoft.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' blob: data: https://*.googleusercontent.com https://*.azureedge.net https://*.microsoft.com https://*.mathpix.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.google.com https://*.azure.com https://*.mathpix.com https://*.groq.com https://*.googleapis.com https://*.openai.com https://*.together.xyz https://*.vercel-insights.com",
              "frame-src 'self' https://*.youtube.com https://*.google.com https://*.microsoft.com",
              "media-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
