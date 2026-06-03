import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any)?.role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const users = await (prisma as any).user.findMany({
            where: {
                accountStatus: 'PENDING',
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                mobileNumber: true,
                class: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ users }, { status: 200 });
    } catch (error) {
        console.error("Error fetching pending users:", error);
        return NextResponse.json({ message: "Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any)?.role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { userId, status } = await req.json();

        if (!userId || !status) {
            return NextResponse.json({ message: "Missing fields" }, { status: 400 });
        }

        const updatedUser = await (prisma as any).user.update({
            where: { id: userId },
            data: { accountStatus: status }
        });

        return NextResponse.json({ success: true, user: updatedUser }, { status: 200 });
    } catch (error) {
        console.error("Error updating user status:", error);
        return NextResponse.json({ message: "Server Error" }, { status: 500 });
    }
}
