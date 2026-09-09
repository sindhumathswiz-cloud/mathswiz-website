import { NextResponse } from 'next/server';

// Retired: see src/app/api/admin/ingest/sessions/route.ts for the full
// explanation. No live caller found anywhere in the app. Note this was a
// third, independent question<->solution matching implementation, distinct
// from lib/solution-matcher.ts and the inline matcher in
// sessions/[id]/parse-direct/route.ts — worth remembering when
// consolidating matching logic later, so it isn't accidentally revived as
// a fourth variant.
export async function POST(_request: Request, _context: { params: Promise<{ id: string }> }) {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/admin/extract-pdf, /api/admin/extract-mathpix, or /api/admin/books instead.' },
    { status: 410 },
  );
}
