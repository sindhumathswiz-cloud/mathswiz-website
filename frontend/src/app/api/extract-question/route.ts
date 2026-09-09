import { NextResponse } from 'next/server';

// Retired: duplicate single-image extraction path. It sent the raw image
// straight to a vision LLM in one shot (no OCR stage) with its own bespoke
// prompt, bypassing the canonical structuring/normalization pipeline
// (lib/structure-questions.ts, lib/extract-normalizer.ts) that
// /api/admin/extract-mathpix and /api/extract-vision both share — extra
// surface area for inconsistent extraction quality with no upside. No live
// caller found anywhere in the app. Use /api/extract-vision (teacher-facing)
// or /api/admin/extract-mathpix (admin-facing) instead.
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/extract-vision or /api/admin/extract-mathpix instead.' },
    { status: 410 },
  );
}
