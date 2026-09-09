import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const registrationSchema = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    mobileNumber: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
    phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/).optional(),
    password: z.string().min(8).max(128),
    role: z.enum(["STUDENT", "TEACHER", "PARENT"]),
    class: z.string().trim().max(50).optional(),
    subjectExpertise: z.string().trim().max(200).optional(),
    childName: z.string().trim().max(160).optional(),
    childMobile: z.string().trim().regex(/^\+?[0-9]{10,15}$/).optional(),
});

export async function POST(req: Request) {
    try {
        const parsed = registrationSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ message: "Please provide valid registration details." }, { status: 400 });
        }
        const { firstName, lastName, mobileNumber, phone, password, role, class: studentClass, subjectExpertise, childName, childMobile } = parsed.data;

        const existingUser = await prisma.user.findUnique({ where: { mobileNumber } });
        if (existingUser) {
            return NextResponse.json({ message: "User already exists" }, { status: 400 });
        }

        const accountStatus = role === "STUDENT" ? "APPROVED" : "PENDING";

        const passwordHash = await hash(password, 12);
        const user = await prisma.user.create({
            data: {
                firstName, 
                lastName, 
                mobileNumber, 
                phone: phone || mobileNumber,
                password: passwordHash,
                role,
                accountStatus,
                class: studentClass, 
                subjectExpertise, 
                childName, 
                childMobile
            }
        });

        return NextResponse.json({
            message: "User created successfully",
            user: { id: user.id, mobileNumber: user.mobileNumber, role: user.role, accountStatus: user.accountStatus },
        }, { status: 201 });
    } catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json({ message: "Error creating user" }, { status: 500 });
    }
}

