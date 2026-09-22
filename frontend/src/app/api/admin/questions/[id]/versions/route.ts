import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await getAuthenticatedUser(["ADMIN"]);
    if ("error" in auth) return auth.error;

    const { id: questionId } = await params;

    const versions = await prisma.questionVersion.findMany({
        where: { questionId },
        orderBy: { version: "desc" },
    });

    return NextResponse.json({ versions });
}
