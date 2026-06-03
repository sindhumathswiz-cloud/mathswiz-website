import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const teacherUser = await (prisma as any).user.findUnique({ where: { id: (session.user as any).id } });
        if (!teacherUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const queries = await (prisma as any).teacherQuery.findMany({
            where: { teacherId: teacherUser.id },
            include: { 
                student: { select: { id: true, firstName: true, lastName: true, email: true, image: true } },
                replies: {
                    include: {
                        sender: { select: { firstName: true, lastName: true, role: true, image: true } },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, queries });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "TEACHER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { queryId, status } = body;

        const teacherUser = await (prisma as any).user.findUnique({ where: { id: (session.user as any).id } });
        if (!teacherUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const query = await (prisma as any).teacherQuery.updateMany({
            where: { id: queryId, teacherId: teacherUser.id },
            data: { status }
        });

        if (query.count === 0) return NextResponse.json({ error: "Query not found or not owned by you" }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
