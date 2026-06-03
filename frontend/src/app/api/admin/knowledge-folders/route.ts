import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session?.user as any);

        if (!user || !user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const className = searchParams.get("className");
        const subject = searchParams.get("subject");

        // Role-based Access Logic:
        // Admin: All matching folders.
        // Teacher: Their own + Admin-created folders.
        const whereClause: any = {
            AND: [
                className ? { className } : {},
                subject ? { subject } : {},
                user.role === 'ADMIN' 
                    ? {} 
                    : {
                        OR: [
                            { userId: user.id },
                            { user: { role: 'ADMIN' } }
                        ]
                    }
            ]
        };

        const folders = await prisma.knowledgeFolder.findMany({
            where: whereClause,
            include: {
                user: {
                    select: { role: true }
                },
                _count: {
                    select: { questions: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, folders });

    } catch (error: any) {
        console.error("[GET-KNOWLEDGE-FOLDERS]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session?.user as any);

        if (!user || !user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { topicName, className, subject, parentId } = await req.json();

        const folder = await prisma.knowledgeFolder.create({
            data: {
                topicName,
                className: className || null,
                subject: subject || null,
                parentId: parentId || null,
                userId: user.id
            }
        });

        return NextResponse.json({ success: true, folder });
    } catch (error: any) {
        console.error("[POST-KNOWLEDGE-FOLDERS]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
