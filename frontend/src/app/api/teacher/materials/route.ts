import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        await request.formData();
        return NextResponse.json(
            { error: 'Direct file uploads are not configured. Add the material using a verified external content URL.' },
            { status: 501 },
        );
    } catch (error) {
        console.error('Error uploading material:', error);
        return NextResponse.json({ error: 'Failed to upload material' }, { status: 500 });
    }
}

