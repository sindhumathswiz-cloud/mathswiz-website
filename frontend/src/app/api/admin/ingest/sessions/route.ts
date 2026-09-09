import { NextResponse } from 'next/server';

// Retired: this route belonged to the legacy ExtractionSession ingestion
// pipeline (SourceDocument -> DocumentPage -> ExtractionSession, with draft
// questions stored as a JSON blob on the session row). A full audit of
// every page and API route in this app found no live caller anywhere —
// question-bank ingestion runs through /api/admin/extract-pdf,
// /api/admin/extract-mathpix, /api/extract-vision, and the
// Book/BookIngestionRun pipeline under /api/admin/books instead. Kept as a
// stub (the available tooling can overwrite but not delete files) so any
// leftover reference fails loudly with a clear message rather than
// silently 404ing or resurrecting dead session state. Safe to delete this
// file entirely the next time someone has direct filesystem access.
function gone() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/admin/extract-pdf, /api/admin/extract-mathpix, or /api/admin/books instead.' },
    { status: 410 },
  );
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}
