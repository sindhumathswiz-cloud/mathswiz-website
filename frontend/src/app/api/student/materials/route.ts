import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !(session.user as any)?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as any).id;

        // Fetch user to get their locked class
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const userClass = user.class;

        // Robust Content Filtering:
        // 1. FREE materials matching the user's class
        // 2. PAID materials for which the user has an APPROVED enrollment, filtered by class
        // For Phase 2, we strictly filter everything by the user's locked class.
        
        const materials = await (prisma as any).material.findMany({
            where: {
                class: userClass,
                OR: [
                    { isFree: true },
                    {
                        // Complexity: Material -> Teacher -> Batch -> Enrollment
                        // Simplification for now: All materials for that class are shown to approved students
                        // but strictly filtered by class.
                        createdBy: {
                            teacherBatches: {
                                some: {
                                    enrollments: {
                                        some: {
                                            studentId: userId,
                                            status: 'APPROVED'
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Fallback dummy data if nothing exists in DB yet, but marked as filtered
        if (materials.length === 0) {
            return NextResponse.json({
                data: [
                    { id: 'f1', title: `${userClass || 'General'} Math PYQs`, type: 'PDF', isFree: true, class: userClass },
                    { id: 'f2', title: `${userClass || 'General'} Sample Paper`, type: 'PDF', isFree: true, class: userClass }
                ],
                isLive: false
            });
        }

        return NextResponse.json({ data: materials, isLive: true });

    } catch (error) {
        console.error('Failed to fetch materials:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

