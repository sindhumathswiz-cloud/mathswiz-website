import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;

    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        mobileNumber: true,
        role: true,
        accountStatus: true,
        subscription: true,
        aiTokens: true,
        class: true,
        image: true,
        createdAt: true,
        lastActiveAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    await (prisma as any).user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Error fetching user status:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
