import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { questionIds } = await request.json();

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json({ success: false, error: "No question IDs provided" }, { status: 400 });
    }

    console.log(`[BULK-DELETE] Deleting ${questionIds.length} questions`);

    await prisma.questionTag.deleteMany({
      where: { questionId: { in: questionIds } },
    });

    const deleted = await prisma.question.deleteMany({
      where: { id: { in: questionIds } },
    });

    console.log(`[BULK-DELETE] Deleted ${deleted.count} questions`);

    return NextResponse.json({ success: true, count: deleted.count });
  } catch (error: any) {
    console.error(`[BULK-DELETE] Error:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
