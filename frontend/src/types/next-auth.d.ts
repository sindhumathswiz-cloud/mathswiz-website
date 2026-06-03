import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import type { Role } from "@prisma/client";

export type UserRole = "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: UserRole;
    accountStatus?: string;
    microsoftId?: string;
    lastActiveAt?: Date;
    lastLoginAt?: Date;
    loginDevice?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: UserRole;
    accessToken?: string;
  }
}
