import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role === "STUDENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { title, start, end, batchId } = await req.json();
        const accessToken = (session as any).accessToken;
        const batch = await prisma.batch.findUnique({ where: { id: batchId } });
        if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

        // 🩺 IDENTITY HEALING: Ensure we use the persistent DB CUID, not the Microsoft ID
        const teacherId = (session?.user as any)?.id;
        const dbTeacher = await prisma.user.findUnique({
            where: { id: teacherId }
        });
        
        if (!dbTeacher) {
            return NextResponse.json({ error: "Teacher account not found in database." }, { status: 400 });
        }
        const validTeacherId = dbTeacher.id;

        if (!accessToken) {
            return NextResponse.json({ error: "Microsoft Account not linked. Please re-login via Azure AD." }, { status: 400 });
        }
        if (!title || !start || !end || !batchId) {
            return NextResponse.json({ error: "Missing required fields: title, start, end, batchId" }, { status: 400 });
        }

        // Create MS Teams Online Meeting via Graph API
        const eventPayload = {
            subject: title,
            start: { dateTime: new Date(start).toISOString(), timeZone: "Asia/Kolkata" },
            end: { dateTime: new Date(end).toISOString(), timeZone: "Asia/Kolkata" },
            isOnlineMeeting: true,
            onlineMeetingProvider: "teamsForBusiness"
        };

        let meetingUrl = batch.teamChatUrl || "";
        let eventId: string | null = null;

        try {
            const eventRes = await fetch('https://graph.microsoft.com/v1.0/me/events', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventPayload)
            });

            if (eventRes.ok) {
                const eventData = await eventRes.json();
                meetingUrl = eventData.onlineMeeting?.joinUrl || meetingUrl;
                eventId = eventData.id;
            } else {
                console.error("Graph Event creation failed:", await eventRes.text());
            }
        } catch (e) {
            console.error("Graph API event creation error:", e);
        }

        // Save to LiveClass table
        const liveClass = await prisma.liveClass.create({
            data: {
                batchId: batch.id,
                title,
                startTime: new Date(start),
                endTime: new Date(end),
                meetingUrl,
                eventId
            }
        });

        // Update batch's last meeting link
        await prisma.batch.update({
            where: { id: batch.id },
            data: { lastMeetingLink: meetingUrl, lastMeetingId: eventId } as any
        });

        // Create a Notice to inform students
        await prisma.notice.create({
            data: {
                title: `📅 New Class: ${title}`,
                content: `A new live class "${title}" has been scheduled for ${new Date(start).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. Join from your dashboard!`,
                batchId: batch.id,
                teacherId: validTeacherId
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: `Meeting "${title}" scheduled successfully!`,
            liveClass,
            meetingUrl
        });

    } catch (error: any) {
        console.error("Schedule Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role === "STUDENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id, title, start, end } = await req.json();
        const accessToken = (session as any).accessToken;

        if (!id || !title || !start || !end) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const liveClass = await prisma.liveClass.findUnique({ where: { id } });
        if (!liveClass) return NextResponse.json({ error: "Class not found" }, { status: 404 });

        if (liveClass.eventId && accessToken) {
            // Update Graph API Event
            const updatePayload = {
                subject: title,
                start: { dateTime: new Date(start).toISOString(), timeZone: "Asia/Kolkata" },
                end: { dateTime: new Date(end).toISOString(), timeZone: "Asia/Kolkata" }
            };

            await fetch(`https://graph.microsoft.com/v1.0/me/events/${liveClass.eventId}`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatePayload)
            });
        }

        const updated = await prisma.liveClass.update({
            where: { id },
            data: {
                title,
                startTime: new Date(start),
                endTime: new Date(end)
            }
        });

        return NextResponse.json({ success: true, liveClass: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role === "STUDENT") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const accessToken = (session as any).accessToken;

        if (!id) return NextResponse.json({ error: "Missing class ID" }, { status: 400 });

        const liveClass = await prisma.liveClass.findUnique({ where: { id } });
        if (!liveClass) return NextResponse.json({ error: "Class not found" }, { status: 404 });

        // 🛑 Cancel Microsoft Teams Event if it exists
        if (liveClass.eventId && accessToken) {
            try {
                await fetch(`https://graph.microsoft.com/v1.0/me/events/${liveClass.eventId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
            } catch (e) {
                console.error("Failed to delete Graph Event:", e);
                // We proceed to delete from local DB anyway to keep UI clean
            }
        }

        // 🗑️ Remove from Prisma
        await prisma.liveClass.delete({ where: { id } });

        return NextResponse.json({ success: true, message: "Meeting deleted successfully" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

