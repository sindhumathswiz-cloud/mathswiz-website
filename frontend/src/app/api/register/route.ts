import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const registrationSchema = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    mobile: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
    password: z.string().min(8).max(128),
    role: z.enum(["STUDENT", "TEACHER", "PARENT"]),
    studentClass: z.string().trim().max(50).optional(),
    childName: z.string().trim().max(160).optional(),
    childMobile: z.string().trim().regex(/^\+?[0-9]{10,15}$/).optional(),
    subjectExpertise: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
    try {
        const parsed = registrationSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ message: "Please provide valid registration details." }, { status: 400 });
        }
        const { firstName, lastName, mobile, password, role, studentClass, childName, childMobile, subjectExpertise } = parsed.data;

        // 3. Verify uniqueness 
        const existingUser = await prisma.user.findUnique({
            where: { mobileNumber: mobile }
        });

        if (existingUser) {
            return NextResponse.json({ message: "User with this mobile number already exists." }, { status: 409 });
        }

        // 4. Hash Password
        const hashedPassword = await hash(password, 12);

        // 5. Create user logic
        const accountStatus = role === 'STUDENT' ? 'APPROVED' : 'PENDING';

        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                mobileNumber: mobile,
                password: hashedPassword,
                role,
                accountStatus,
                ...(role === 'STUDENT' && studentClass ? { class: studentClass } : {}),
                ...(role === 'PARENT' ? { childName, childMobile } : {}),
                ...(role === 'TEACHER' ? { subjectExpertise } : {})
            }
        });

        // 6. Return successful response safely omitting password
        return NextResponse.json({
            message: "User registered successfully",
            user: { id: user.id, mobile: user.mobileNumber, role: user.role }
        }, { status: 201 });

    } catch (error) {
        console.error("Registration Error:", error);
        return NextResponse.json({ message: "Server Error during registration." }, { status: 500 });
    }
}

