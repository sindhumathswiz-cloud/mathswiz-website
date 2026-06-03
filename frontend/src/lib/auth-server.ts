import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@/types/next-auth";

export async function getAuthenticatedUser(requiredRoles?: UserRole[]) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as UserRole,
  };

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user };
}
