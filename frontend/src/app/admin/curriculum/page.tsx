import prisma from "@/lib/prisma";
import { unstable_noStore as noStore } from "next/cache";
import CurriculumManagerClient from "./CurriculumManagerClient";

export default async function CurriculumManagerPage() {
    noStore();

    const classes = await prisma.tagTaxonomy.findMany({
        where: { type: 'CLASS', isActive: true },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        include: {
            children: {
                where: { type: 'SUBJECT', isActive: true },
                orderBy: { name: 'asc' },
                include: {
                    children: {
                        where: { type: 'TOPIC', isActive: true },
                        orderBy: { order: 'asc' },
                        include: {
                            children: {
                                where: { type: 'SUBTOPIC', isActive: true },
                                orderBy: { order: 'asc' },
                            }
                        }
                    }
                }
            }
        }
    });

    const pendingCount = await prisma.tagTaxonomy.count({
        where: { isApproved: false }
    });

    return (
        <CurriculumManagerClient 
            initialClasses={classes} 
            pendingCount={pendingCount}
        />
    );
}