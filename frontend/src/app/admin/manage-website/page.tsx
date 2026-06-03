import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ManageWebsiteStudio } from "@/components/admin/ManageWebsiteStudio";

export default async function ManageWebsitePage() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
        redirect("/login");
    }

    const sitePages = await prisma.sitePage.findMany({
        orderBy: { updatedAt: "desc" }
    });

    return (
        <div className="min-h-screen bg-gray-50/50">
            <ManageWebsiteStudio sitePages={sitePages} />
        </div>
    );
}
