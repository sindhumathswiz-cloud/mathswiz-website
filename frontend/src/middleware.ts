import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

const AI_PATHS = ["/api/doubts/", "/api/extract-", "/api/student/practice/", "/api/admin/ingest/"];
const AUTH_PATHS = ["/api/auth/", "/api/register"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rateLimitKey = `ratelimit:${ip}`;

  let rateTier: "ai" | "auth" | "general" = "general";
  if (AI_PATHS.some((p) => path.startsWith(p))) rateTier = "ai";
  else if (AUTH_PATHS.some((p) => path.startsWith(p))) rateTier = "auth";

  const rateStore = new Map<string, { count: number; resetTime: number }>();
  const config = { windowMs: 60_000, maxRequests: rateTier === "ai" ? 10 : rateTier === "auth" ? 5 : 100 };
  const now = Date.now();
  const entry = rateStore.get(rateLimitKey);

  if (!entry || now > entry.resetTime) {
    rateStore.set(rateLimitKey, { count: 1, resetTime: now + config.windowMs });
  } else if (entry.count >= config.maxRequests) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((entry.resetTime - now) / 1000)) } }
    );
  } else {
    entry.count++;
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

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
  ],
};
