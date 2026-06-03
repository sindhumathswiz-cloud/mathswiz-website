import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const title = formData.get('title') as string | null;
        const isFree = formData.get('isFree') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // VERCEL COMPATIBILITY: Do not write to local `fs`. Mock an S3 upload.
        const mockFileUrl = `https://mock-s3-bucket.s3.amazonaws.com/${file.name || 'document.pdf'}`;

        return NextResponse.json({
            message: 'Material uploaded successfully',
            material: {
                id: Date.now().toString(),
                fileUrl: mockFileUrl,
                title: title || 'Untitled Material',
                isFree: isFree === 'true'
            }
        });
    } catch (error) {
        console.error('Error uploading material:', error);
        return NextResponse.json({ error: 'Failed to upload material' }, { status: 500 });
    }
}

