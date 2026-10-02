import { NextResponse } from 'next/server';
import { getFreePreviewChapters } from '@/lib/free-preview-content';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ chapters: await getFreePreviewChapters() });
  } catch (error) {
    console.error('Could not load free preview chapters', error);
    return NextResponse.json({ error: 'Free preview is temporarily unavailable.' }, { status: 500 });
  }
}
