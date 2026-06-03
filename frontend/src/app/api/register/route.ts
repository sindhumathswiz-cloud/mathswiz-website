import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { firstName, lastName, mobile, password, role, studentClass, childName, childMobile, subjectExpertise } = body;

        // 1. Validate mandatory fields
        if (!firstName || !lastName || !mobile || !password || !role) {
            return NextResponse.json({ message: "Missing essential required fields." }, { status: 400 });
        }

        // 2. Prevent Admin registration
        if (role === "ADMIN") {
            return NextResponse.json({ message: "Admin role cannot be self-registered." }, { status: 403 });
        }

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

    } catch (error: any) {
        console.error("Registration Error:", error);
        return NextResponse.json(
            { message: "Server Error during registration.", error: error?.message || "Unknown error" },
            { status: 500 }
        );
    }
}

