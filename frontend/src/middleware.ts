import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { authorizeApiPath } from "@/lib/api-authorization";
import { checkRateLimit, type RateLimitTier } from "@/lib/rate-limit";

const AI_PATHS = [
  "/api/doubts/",
  "/api/extract",
  "/api/rag/",
  "/api/student/doubt-buddy/",
  "/api/student/practice/",
  "/api/admin/ingest/",
  "/api/admin/auto-populate",
  "/api/admin/solutions/",
  "/api/teacher/questions/generate-from-rag",
  "/api/teacher/knowledge/flashcards/generate",
];
const AUTH_PATHS = [
  "/api/auth/callback/credentials",
  "/api/auth/signin",
  "/api/auth/register",
  "/api/register",
];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.NEXT_AUTH_SECRET });

  if (path.startsWith("/api/")) {
    const decision = authorizeApiPath(path, token?.role as string | undefined, req.method);
    if (!decision.allowed) {
      return NextResponse.json(
        { error: decision.message },
        { status: decision.status },
      );
    }
    if (path === "/api/health" || path.startsWith("/api/health/")) {
      return NextResponse.next();
    }
  }

  if (path.startsWith("/api/")) {
    let rateTier: RateLimitTier = "general";
    if (AI_PATHS.some((prefix) => path.startsWith(prefix))) rateTier = "ai";
    else if (AUTH_PATHS.some((prefix) => path.startsWith(prefix))) rateTier = "auth";

    const forwardedIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwardedIp || req.headers.get("x-real-ip") || "unknown";
    const identity = token?.id ? `user:${String(token.id)}` : `ip:${ip}`;
    const limit = await checkRateLimit(identity, rateTier);

    const failClosed = process.env.NODE_ENV === "production" && (rateTier === "auth" || rateTier === "ai");
    if (!limit.available && failClosed) {
      return NextResponse.json(
        { error: "Request protection service is temporarily unavailable." },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }

    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))),
            "X-RateLimit-Remaining": String(limit.remaining),
          },
        },
      );
    }
  }

  if (path.startsWith("/admin") || path.startsWith("/teacher") || path.startsWith("/student") || path.startsWith("/parent")) {
    if (!token || !token.role) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const role = token.role as string;
    if (path.startsWith("/admin") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (path.startsWith("/teacher") && role !== "TEACHER") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (path.startsWith("/student") && role !== "STUDENT") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (path.startsWith("/parent") && role !== "PARENT") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if ((path === "/login" || path === "/register") && token?.role) {
    return NextResponse.redirect(new URL(`/${token.role.toString().toLowerCase()}/dashboard`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/parent/:path*",
    "/login",
    "/register",
    "/api/doubts/:path*",
    "/api/extract-:path*",
    "/api/student/practice/:path*",
    "/api/admin/ingest/:path*",
    "/api/auth/:path*",
    "/api/register",
    "/api/:path*",
  ],
};
