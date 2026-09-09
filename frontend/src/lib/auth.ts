import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import prisma from "@/lib/prisma";
import type { UserRole } from "@/types/next-auth";
import { awardPoints, POINTS_RULES } from "@/lib/gamification";
import { compare, hash } from "bcryptjs";

const authSecret = process.env.NEXTAUTH_SECRET || process.env.NEXT_AUTH_SECRET;

if (!authSecret) {
    throw new Error("NEXTAUTH_SECRET is required. Authentication cannot start without it.");
}

const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }));
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
    providers.push(AzureADProvider({
        clientId: process.env.AZURE_AD_CLIENT_ID,
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
        tenantId: process.env.AZURE_AD_TENANT_ID,
        authorization: {
            params: {
                scope: "openid profile email offline_access User.Read Team.ReadBasic.All Group.Read.All Calendars.ReadWrite OnlineMeetings.ReadWrite Notes.Read Notes.Read.All Notes.ReadWrite Notes.ReadWrite.All TeamMember.ReadWrite.All TeamSettings.ReadWrite.All"
            }
        }
    }));
}

providers.push(
    CredentialsProvider({
        name: "Mobile / Password",
        credentials: {
            mobile: { label: "Mobile Number", type: "text", placeholder: "10-digit number" },
            password: { label: "Password", type: "password" },
        },
        async authorize(credentials, req) {
            const mobile = credentials?.mobile?.trim();
            if (!mobile || !credentials?.password) return null;

            const user = await prisma.user.findUnique({ where: { mobileNumber: mobile } });
            if (!user?.password) return null;

            if (user.accountStatus !== "APPROVED") {
                throw new Error(
                    user.accountStatus === "BLOCKED"
                        ? "Your account has been blocked by the administrator."
                        : "Your account is awaiting administrator approval."
                );
            }

            const hasBcryptPassword = /^\$2[aby]\$\d{2}\$/.test(user.password);
            const isPasswordValid = hasBcryptPassword
                ? await compare(credentials.password, user.password)
                : credentials.password === user.password;
            if (!isPasswordValid) return null;

            // Transparently secure legacy accounts that still contain a plain-text password.
            // The original password works once and is never stored in plain text again.
            const upgradedPassword = hasBcryptPassword
                ? undefined
                : await hash(credentials.password, 12);

            const deviceInfo = req?.headers?.["user-agent"] || "Unknown Device";
            const updatedUser = await prisma.user.update({
                where: { id: user.id },
                data: {
                    ...(upgradedPassword ? { password: upgradedPassword } : {}),
                    lastActiveAt: new Date(),
                    lastLoginAt: new Date(),
                    loginDevice: deviceInfo,
                },
            });

            return {
                id: updatedUser.id,
                email: updatedUser.email ?? undefined,
                name: updatedUser.firstName ?? undefined,
                image: updatedUser.image ?? undefined,
                role: updatedUser.role,
                microsoftId: updatedUser.microsoftId ?? undefined,
                accountStatus: updatedUser.accountStatus,
            };
        },
    })
);

export const authOptions: NextAuthOptions = {
    providers,
    callbacks: {
        async signIn({ user, account, profile }) {
            try {
                if (account?.provider === 'credentials') {
                    return true;
                }

                const email = (user?.email || ((profile as Record<string, unknown>)?.preferred_username as string) || ((profile as Record<string, unknown>)?.email as string))?.toLowerCase();

                if (!email) return false;

                const superAdmin = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
                const teacherAdmin = process.env.MASTER_ADMIN_EMAIL?.toLowerCase();

                const isSuperAdmin = email === superAdmin;
                const isTeacherAdmin = email === teacherAdmin;

                let assignedRole: UserRole = "STUDENT";
                if (isSuperAdmin) assignedRole = "ADMIN";
                else if (isTeacherAdmin) assignedRole = "TEACHER";

                const dbUser = await prisma.user.findUnique({ where: { email: email } });
                if (dbUser && dbUser.accountStatus !== "APPROVED") return false;
                
                await prisma.user.upsert({
                    where: { email: email },
                    update: {
                        microsoftId: account?.providerAccountId || "",
                        lastLoginAt: new Date(),
                        loginDevice: "SSO",
                        ...(isSuperAdmin || isTeacherAdmin ? { role: assignedRole } : {})
                    },
                    create: {
                        email: email,
                        firstName: user?.name?.split(' ')[0] || (profile as Record<string, unknown>)?.name?.toString().split(' ')[0] || "SSO",
                        lastName: user?.name?.split(' ').slice(1).join(' ') || (profile as Record<string, unknown>)?.name?.toString().split(' ').slice(1).join(' ') || "User",
                        microsoftId: account?.providerAccountId || "",
                        role: assignedRole,
                        accountStatus: "APPROVED",
                        lastActiveAt: new Date(),
                        lastLoginAt: new Date(),
                        loginDevice: "SSO"
                    }
                });
                
                // Award daily login points to students
                if (dbUser && dbUser.role === 'STUDENT') {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    
                    const lastLoginPoints = await prisma.pointsTransaction.findFirst({
                        where: {
                            userId: dbUser.id,
                            reason: 'Daily login',
                            createdAt: { gte: yesterday }
                        }
                    });
                    
                    if (!lastLoginPoints) {
                        await awardPoints(dbUser.id, POINTS_RULES.DAILY_LOGIN, 'Daily login', {});
                    }
                }
                
                return true;
            } catch (error) {
                console.error("[AUTH] SignIn Error:", error);
                return false;
            }
        },
        async jwt({ token, user, account }) {
            if (account) token.accessToken = account.access_token;

            if (user) {
                token.id = user.id;
                token.role = user.role;
                token.accountStatus = user.accountStatus;
            }

            const email = token.email?.toLowerCase();
            const isSuperAdmin = !!email && email === process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
            const isTeacherAdmin = !!email && email === process.env.MASTER_ADMIN_EMAIL?.toLowerCase();

            const dbUser = token.email
                ? await prisma.user.findUnique({ where: { email: token.email } })
                : token.id
                    ? await prisma.user.findUnique({ where: { id: token.id } })
                    : null;

            if (dbUser) {
                token.id = dbUser.id;
                token.accountStatus = dbUser.accountStatus;
                token.role = dbUser.accountStatus !== "APPROVED"
                    ? undefined
                    : isSuperAdmin
                        ? "ADMIN"
                        : isTeacherAdmin
                            ? "TEACHER"
                            : dbUser.role;
            }

            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.role = token.role;
                session.user.id = token.id || "";
                session.user.accountStatus = token.accountStatus;
            }
            session.accessToken = token.accessToken;
            return session;
        }
    },
    secret: authSecret,
    session: { strategy: "jwt" },
    pages: {
        signIn: '/login',
        newUser: '/register'
    }
};
