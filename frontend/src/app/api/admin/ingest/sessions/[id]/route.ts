import { NextResponse } from 'next/server';

// Retired: see src/app/api/admin/ingest/sessions/route.ts for the full
// explanation. This is the single-session GET/PATCH/DELETE endpoint of the
// same orphaned ExtractionSession pipeline — no live caller found anywhere
// in the app. Kept as a stub so a leftover reference fails loudly.
function gone() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/admin/extract-pdf, /api/admin/extract-mathpix, or /api/admin/books instead.' },
    { status: 410 },
  );
}

export async function GET(_request: Request, _context: { params: Promise<{ id: string }> }) {
  return gone();
}

export async function PATCH(_request: Request, _context: { params: Promise<{ id: string }> }) {
  return gone();
}

export async function DELETE(_request: Request, _context: { params: Promise<{ id: string }> }) {
  return gone();
}
