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
        const body = await req.json().catch(() => ({}));
        const { autoDiscovery = true } = body;
        const accessToken = (session as any).accessToken;
        const teacherId = (session as any).user.id;
        const teacherEmail = (session as any).user.email?.toLowerCase();

        if (!accessToken) {
            return NextResponse.json({ error: "Microsoft Account not linked or session expired. Please re-login via Azure AD." }, { status: 400 });
        }

        let studentsSynced = 0;
        let batchesSynced = 0;
        const syncLogs: string[] = [];

        // 0. Ensure we have a valid database ID for the teacher (FK constraint safety)
        const dbTeacher = await prisma.user.findUnique({
            where: { id: teacherId }
        });
        
        if (!dbTeacher) {
            return NextResponse.json({ 
                error: `User "${(session.user as any).email}" not found in database. Please logout and re-login to synchronize your account properly.`,
                logs: syncLogs
            }, { status: 400 });
        }
        
        const validTeacherId = dbTeacher.id;
        syncLogs.push(`Teacher Identity Verified: ${dbTeacher.email} (ID: ${validTeacherId})`);

        // 1. Fetch all Teams the user has joined
        const teamsRes = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!teamsRes.ok) {
            const errBody = await teamsRes.json().catch(() => ({}));
            const errText = errBody.error?.message || "Unknown Graph Error";
            syncLogs.push(`Graph API /me/joinedTeams failed: ${teamsRes.status} - ${errText}`);
            return NextResponse.json({ 
                error: `Microsoft Graph Error (${teamsRes.status}): ${errText}. Please logout and re-login to refresh your permissions.`, 
                logs: syncLogs 
            }, { status: 500 });
        }
        const teamsData = await teamsRes.json();
        const msTeams: any[] = teamsData.value || [];
        syncLogs.push(`Found ${msTeams.length} Microsoft Teams.`);

        for (const team of msTeams) {
            syncLogs.push(`Processing Team: "${team.displayName}" (${team.id})`);
            
            // --- UPSERT BATCH ---
            let teamChatUrl = `https://teams.microsoft.com/l/team/${team.id}/conversations`;
            let oneNoteUrl: string | null = null;

            // --- 🚀 PARALLEL RESOURCE DISCOVERY ---
            const [notebookRes, channelRes, eventsRes] = await Promise.all([
                fetch(`https://graph.microsoft.com/v1.0/groups/${team.id}/onenote/notebooks`, { headers: { 'Authorization': `Bearer ${accessToken}` } }),
                fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/channels`, { headers: { 'Authorization': `Bearer ${accessToken}` } }),
                fetch(`https://graph.microsoft.com/v1.0/groups/${team.id}/events?$top=50&$orderby=start/dateTime desc`, { headers: { 'Authorization': `Bearer ${accessToken}` } })
            ]);

            // 📗 Notebook Logic (Optimized)
            if (notebookRes.ok) {
                try {
                    const notebookData = await notebookRes.json();
                    const notebooks = notebookData?.value || [];
                    const targetNb = notebooks.find((nb: any) => nb.displayName?.toLowerCase().includes('class')) || notebooks[0];
                    if (targetNb) oneNoteUrl = targetNb.links?.oneNoteWebUrl?.href || targetNb.links?.oneNoteClientUrl?.href || null;
                } catch(e) {}
            }

            // 💬 Channel Logic (Optimized)
            if (channelRes.ok) {
                try {
                    const channels = await channelRes.json();
                    const general = channels.value?.find((c: any) => c.displayName === 'General') || channels.value?.[0];
                    if (general?.webUrl) teamChatUrl = general.webUrl;
                } catch(e) {}
            }

            // --- UPSERT BATCH ---
            let batch = await prisma.batch.findUnique({ where: { microsoftTeamId: team.id } });
            if (batch && session.user.role !== "ADMIN" && batch.teacherId !== validTeacherId) {
                syncLogs.push(`Skipped Team "${team.displayName}": it is already linked to another teacher.`);
                continue;
            }
            if (!batch) {
                batch = await prisma.batch.findFirst({ where: { name: team.displayName, teacherId: validTeacherId } });
            }

            if (batch) {
                batch = await prisma.batch.update({
                    where: { id: batch.id },
                    data: {
                        microsoftTeamId: team.id,
                        oneNoteUrl,
                        teamChatUrl,
                        ...(session.user.role === "ADMIN" ? { teacherId: validTeacherId } : {}),
                    }
                });
            } else {
                batch = await prisma.batch.create({
                    data: {
                        name: team.displayName,
                        code: team.displayName.replace(/\s+/g, '').substring(0, 8).toUpperCase() + Math.floor(Math.random()*1000),
                        teacherId: validTeacherId,
                        microsoftTeamId: team.id,
                        oneNoteUrl,
                        teamChatUrl
                    }
                });
            }
            batchesSynced++;

            // --- 👥 ROSTER SYNC (Simplified for FastSync) ---
            try {
                const membersRes = await fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/members`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                if (membersRes.ok) {
                    const membersData = await membersRes.json();
                    const allTeamMembers = membersData.value || [];
                    for (const member of allTeamMembers) {
                        const memberEmail = member.email || member.mail || member.userPrincipalName;
                        if (!memberEmail || memberEmail.toLowerCase() === teacherEmail) continue;

                        const emailHash = memberEmail.toLowerCase();
                        const dbUser = await prisma.user.upsert({
                            where: { email: emailHash },
                            update: { microsoftId: member.userId || member.id },
                            create: {
                                email: emailHash,
                                firstName: member.displayName?.split(' ')[0] || "Student",
                                lastName: member.displayName?.split(' ').slice(1).join(' ') || "",
                                role: "STUDENT",
                                accountStatus: "APPROVED"
                            }
                        });
                        await prisma.batchEnrollment.upsert({
                            where: { batchId_studentId: { batchId: batch.id, studentId: dbUser.id } },
                            update: { status: "APPROVED" },
                            create: { batchId: batch.id, studentId: dbUser.id, status: "APPROVED" }
                        });
                        studentsSynced++;
                    }
                }
            } catch(e) {}

            // --- 📅 CALENDAR & RECORDING SYNC (Fast Discovery) ---
            if (eventsRes.ok) {
                try {
                    const eventsData = await eventsRes.json();
                    const events = eventsData.value || [];
                    // Limit heavy recording search to only the most recent 5 events
                    const recentEvents = events.slice(0, 5);

                    for (const ev of events) {
                        const startTime = new Date(ev.start?.dateTime + 'Z');
                        const endTime = new Date(ev.end?.dateTime + 'Z');
                        const isPast = new Date() > endTime;
                        const isRecent = recentEvents.some((re: any) => re.id === ev.id);
                        let recordingUrl = null;

                        if (isPast && isRecent && ev.onlineMeeting?.joinUrl) {
                            try {
                                const mLookup = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=JoinWebUrl eq '${ev.onlineMeeting.joinUrl}'`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                                const mData = await mLookup.json();
                                const mId = mData.value?.[0]?.id;
                                if (mId) {
                                    const rRes = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings/${mId}/recordings`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                                    const rData = await rRes.json();
                                    recordingUrl = rData.value?.[0]?.contentUrl || null;
                                }
                            } catch (e) {}
                        }

                        const meetingUrl = ev.onlineMeeting?.joinUrl || teamChatUrl;
                        await prisma.liveClass.upsert({
                            where: { eventId: ev.id },
                            update: { 
                                startTime, 
                                endTime, 
                                meetingUrl, 
                                title: ev.subject, 
                                recordingUrl: (recordingUrl ?? undefined) as any
                            },
                            create: { 
                                batchId: batch.id, 
                                eventId: ev.id, 
                                title: ev.subject, 
                                startTime, 
                                endTime, 
                                meetingUrl, 
                                recordingUrl: (recordingUrl ?? undefined) as any
                            }
                        });
                    }
                } catch(e) {}
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: `Sync Complete: ${batchesSynced} batches matched, ${studentsSynced} total students synced.`,
            count: batchesSynced,
            studentsSynced,
            logs: syncLogs
        });

    } catch (error: any) {
        console.error("Sync Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}

