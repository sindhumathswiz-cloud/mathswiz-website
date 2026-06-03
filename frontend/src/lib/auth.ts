import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import prisma from "@/lib/prisma";
import type { Role, AccountStatus } from "@prisma/client";
import { awardPoints, POINTS_RULES } from "@/lib/gamification";

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "mock_client_id",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock_client_secret",
        }),
        AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID,
            authorization: {
                params: {
                    scope: "openid profile email offline_access User.Read Team.ReadBasic.All Group.Read.All Calendars.ReadWrite OnlineMeetings.ReadWrite Notes.Read Notes.Read.All Notes.ReadWrite Notes.ReadWrite.All TeamMember.ReadWrite.All TeamSettings.ReadWrite.All"
                }
            }
        }),
        CredentialsProvider({
            name: "Mobile / Password",
            credentials: {
                mobile: { label: "Mobile Number", type: "text", placeholder: "10-digit number" },
                password: { label: "Password (leave blank if using OTP)", type: "password" },
                otp: { label: "OTP", type: "text", placeholder: "1234" }
            },
            async authorize(credentials, req) {
                if (!credentials?.mobile) return null;

                const user = await prisma.user.findUnique({ where: { mobileNumber: credentials.mobile } });

                if (user?.accountStatus === 'BLOCKED') {
                    throw new Error("Your account has been blocked by the administrator.");
                }

                const isOtpValid = credentials.otp === "1234";
                const isPasswordValid = !!user?.password && credentials.password === user.password;

                if (isOtpValid || isPasswordValid) {
                    const deviceInfo = req?.headers?.['user-agent'] || "Unknown Device";

                    if (!user) {
                        const newUser = await prisma.user.create({
                            data: {
                                mobileNumber: credentials.mobile,
                                role: "STUDENT" as Role,
                                accountStatus: "APPROVED" as AccountStatus,
                                lastActiveAt: new Date(),
                                lastLoginAt: new Date(),
                                loginDevice: deviceInfo
                            }
                        });
                        return {
                            id: newUser.id,
                            email: newUser.email ?? undefined,
                            name: newUser.firstName ?? undefined,
                            image: newUser.image ?? undefined,
                            role: newUser.role,
                            microsoftId: newUser.microsoftId ?? undefined,
                            accountStatus: newUser.accountStatus,
                        };
                    } else {
                        const updatedUser = await prisma.user.update({
                            where: { id: user.id },
                            data: {
                                lastActiveAt: new Date(),
                                lastLoginAt: new Date(),
                                loginDevice: deviceInfo
                            }
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
                    }
                }
                return null;
            }
        })
    ],
    callbacks: {
        async signIn({ user, account, profile }) {
            try {
                if (account?.provider === 'credentials') {
                    return true;
                }

                const email = (user?.email || ((profile as Record<string, unknown>)?.preferred_username as string) || ((profile as Record<string, unknown>)?.email as string))?.toLowerCase();

                if (!email) return false;

                const superAdmin = process.env.SUPER_ADMIN_EMAIL?.toLowerCase() || "maverick@sindhusmathswizclasses.com";
                const teacherAdmin = process.env.MASTER_ADMIN_EMAIL?.toLowerCase() || "sindhu@sindhusmathswizclasses.com";

                const isSuperAdmin = email === superAdmin;
                const isTeacherAdmin = email === teacherAdmin;

                let assignedRole: Role = "STUDENT";
                if (isSuperAdmin) assignedRole = "ADMIN";
                else if (isTeacherAdmin) assignedRole = "TEACHER";

                const dbUser = await prisma.user.findUnique({ where: { email: email } });
                
                await prisma.user.upsert({
                    where: { email: email },
                    update: {
                        microsoftId: account?.providerAccountId || "",
                        lastLoginAt: new Date(),
                        loginDevice: "SSO",
                        role: assignedRole
                    },
                    create: {
                        email: email,
                        firstName: user?.name?.split(' ')[0] || (profile as Record<string, unknown>)?.name?.toString().split(' ')[0] || "SSO",
                        lastName: user?.name?.split(' ').slice(1).join(' ') || (profile as Record<string, unknown>)?.name?.toString().split(' ').slice(1).join(' ') || "User",
                        microsoftId: account?.providerAccountId || "",
                        role: assignedRole,
                        accountStatus: "APPROVED" as AccountStatus,
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
                return true;
            }
        },
        async jwt({ token, user, account }) {
            if (account) token.accessToken = account.access_token;

            if (user) {
                token.id = user.id;
                token.role = user.role;
            }

            const email = token.email?.toLowerCase();
            const isSuperAdmin = email === "maverick@sindhusmathswizclasses.com" ||
                email === (process.env.SUPER_ADMIN_EMAIL || "").toLowerCase();
            const isTeacherAdmin = email === "sindhu@sindhusmathswizclasses.com" ||
                email === (process.env.MASTER_ADMIN_EMAIL || "").toLowerCase();

            if (isSuperAdmin) {
                token.role = "ADMIN";
            } else if (isTeacherAdmin) {
                token.role = "TEACHER";
            } else if (token.email) {
                const dbUser = await prisma.user.findUnique({ where: { email: token.email } });
                if (dbUser) {
                    token.role = dbUser.role || "STUDENT";
                    token.id = dbUser.id;
                }
            } else if (token.id && !token.role) {
                const dbUser = await prisma.user.findUnique({ where: { id: token.id as string } });
                if (dbUser) {
                    token.role = dbUser.role || "STUDENT";
                }
            }

            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.role = token.role;
                session.user.id = token.id;
            }
            session.accessToken = token.accessToken;
            return session;
        }
    },
    secret: process.env.NEXT_AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback_development_secret_12345",
    session: { strategy: "jwt" },
    pages: {
        signIn: '/login',
        newUser: '/register'
    }
};
