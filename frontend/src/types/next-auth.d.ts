import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

export type UserRole = "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      role?: UserRole;
      accountStatus?: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role?: UserRole;
    accountStatus?: string;
    microsoftId?: string;
    lastActiveAt?: Date;
    lastLoginAt?: Date;
    loginDevice?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: UserRole;
    accountStatus?: string;
    accessToken?: string;
  }
}
