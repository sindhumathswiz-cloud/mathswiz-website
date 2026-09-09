import { NextResponse } from 'next/server';

// Retired: this was a stateless PDF-preview endpoint from the legacy
// ExtractionSession pipeline (Mathpix whole-doc OCR -> simple rule-based
// paragraph splitter, no database writes at all). No live caller found
// anywhere in the app. Not to be confused with /api/admin/books (plural,
// the current Book/BookIngestionRun pipeline), which is unaffected by
// this change. Use /api/admin/extract-pdf, /api/admin/extract-mathpix, or
// /api/admin/books instead.
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/admin/extract-pdf, /api/admin/extract-mathpix, or /api/admin/books instead.' },
    { status: 410 },
  );
}
