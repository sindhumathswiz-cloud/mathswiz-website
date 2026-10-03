import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePremiumTeacher } from "@/lib/teacher-api-guard";

export async function POST(req: Request) {
    try {
        const guard = await requirePremiumTeacher(await getServerSession(authOptions));
        if (!guard.ok) return guard.response;
        const formData = await req.formData();
        const file = formData.get("file") as Blob;
        if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const result = await mammoth.extractRawText({ buffer });
        return NextResponse.json({ text: result.value });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

