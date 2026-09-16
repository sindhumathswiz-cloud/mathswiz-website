import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { selectQuestionsByFilters, type QuestionFilterSpec } from "@/lib/question-selection";

export const dynamic = 'force-dynamic';

/**
 * The non-AI counterpart to generate-blueprint: a teacher picks structured
 * filters (chapter/topic/difficulty/type/count) directly instead of
 * describing them in a prompt. Same underlying selectQuestionsByFilters and
 * response shape as generate-blueprint, so the test builder UI can reuse
 * the same result-handling code for both entry points.
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;
        const role = session?.user?.role;
        if (!userId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (role !== "TEACHER" && role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json().catch(() => null);
        const filters: QuestionFilterSpec[] = Array.isArray(body?.filters) ? body.filters : [];
        if (filters.length === 0) {
            return NextResponse.json({ error: "At least one filter is required" }, { status: 400 });
        }

        const questions = await selectQuestionsByFilters(filters);
        return NextResponse.json({ success: true, questions });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
