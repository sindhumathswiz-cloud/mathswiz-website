import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { userId, action, role, password } = body;

        const updateData: any = {};

        if (action === 'APPROVE') updateData.accountStatus = 'APPROVED';
        if (action === 'REJECT') updateData.accountStatus = 'REJECTED';
        if (action === 'BLOCK') updateData.accountStatus = 'BLOCKED';
        if (action === 'UNBLOCK') updateData.accountStatus = 'APPROVED';
        if (action === 'FORCE_RESET') updateData.password = password; // In production, hash this again
        if (action === 'UPDATE_ROLE') updateData.role = role;

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        return NextResponse.json({ success: true, user });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}

