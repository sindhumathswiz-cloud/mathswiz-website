import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { authOptions } from "@/lib/auth";

import prisma from "@/lib/prisma";

// Delete a single document
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const docId = (await params).id;
        
        // Ensure the person deleting this owns the folder it belongs to
        // We'll use a nested delete check or just a simple deleteMany with teacherId filtering
        await prisma.knowledgeDocument.deleteMany({
            where: { 
                id: docId,
                folder: {
                    userId: (session.user as any).id || session.user.email
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
