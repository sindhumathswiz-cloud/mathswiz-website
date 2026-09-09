import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkReadiness();
  return NextResponse.json(
    {
      status: result.ready ? "ready" : "not_ready",
      checks: result.checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: result.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
