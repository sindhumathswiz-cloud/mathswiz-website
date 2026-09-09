import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function DashboardRouter() {
    const session = await getServerSession(authOptions); 
    
    if (!session || !session.user) {
        redirect("/login");
    }

    const role = session.user.role;

    if (role === "ADMIN") {
        redirect("/admin/dashboard");
    } else if (role === "TEACHER") {
        redirect("/teacher/dashboard");
    } else if (role === "STUDENT") {
        redirect("/student/dashboard");
    } else if (role === "PARENT") {
        redirect("/parent/dashboard");
    } else {
        // Fallback for unexpected roles
        redirect("/login");
    }
}
