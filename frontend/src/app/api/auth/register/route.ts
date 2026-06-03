import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { firstName, lastName, mobileNumber, phone, password, role, class: studentClass, subjectExpertise, childName, childMobile } = body;

        if (!mobileNumber || !password || !firstName || !lastName) {
            return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { mobileNumber } });
        if (existingUser) {
            return NextResponse.json({ message: "User already exists" }, { status: 400 });
        }

        const accountStatus = role === "STUDENT" ? "APPROVED" : "PENDING";

        const user = await (prisma as any).user.create({
            data: {
                firstName, 
                lastName, 
                mobileNumber, 
                phone: phone || mobileNumber,
                password,
                role: role || "STUDENT", 
                accountStatus,
                class: studentClass, 
                subjectExpertise, 
                childName, 
                childMobile
            }
        });

        return NextResponse.json({ message: "User created successfully", user }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: "Error creating user" }, { status: 500 });
    }
}

