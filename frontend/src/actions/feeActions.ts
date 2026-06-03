"use server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Delete a Fee Structure by ID
export async function deleteFeeStructureAction(id: string) {
    if (!id) throw new Error("Fee Structure ID is required.");
    await (prisma as any).feeStructure.delete({ where: { id } });
    revalidatePath('/teacher/dashboard');
}

// Accepts FormData for bulletproof hidden-input forms
export async function assignFeeToStudentAction(formData: FormData) {
    const enrollmentId = formData.get("enrollmentId") as string;
    const feeStructureId = formData.get("feeStructureId") as string;

    if (!enrollmentId || !feeStructureId) throw new Error("Missing Enrollment ID or Fee Structure ID.");

    const feeStructure = await (prisma as any).feeStructure.findUnique({ where: { id: feeStructureId } });
    if (!feeStructure) throw new Error("Fee structure not found.");

    // 1. Assign the structure to the batch enrollment
    await (prisma as any).batchEnrollment.update({
        where: { id: enrollmentId },
        data: { feeStructureId }
    });

    // 2. Parse installments and generate PaymentRecord rows
    const installments = Array.isArray(feeStructure.installments) 
        ? feeStructure.installments 
        : typeof feeStructure.installments === 'string' 
            ? JSON.parse(feeStructure.installments) 
            : []; 
            
    if (installments && installments.length > 0) {
        // Clear existing UPCOMING records to prevent duplicates on re-assignment
        await (prisma as any).paymentRecord.deleteMany({
            where: { enrollmentId, status: "UPCOMING" }
        });

        const paymentData = installments.map((inst: any) => ({
            enrollmentId,
            amount: parseFloat(inst.amount),
            description: inst.description || "Installment",
            dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
            status: "UPCOMING"
        }));

        await (prisma as any).paymentRecord.createMany({ data: paymentData });
    }

    revalidatePath('/teacher/dashboard');
    revalidatePath('/teacher/batch-management'); 
}

// 1. Assign customized installments to a student
export async function assignCustomFeeToStudentAction(data: { enrollmentId: string, feeStructureId?: string, installments: any[] }) {
    const { enrollmentId, feeStructureId, installments } = data;

    if (!enrollmentId) throw new Error("Missing Enrollment ID.");

    await (prisma as any).batchEnrollment.update({
        where: { id: enrollmentId },
        data: { feeStructureId: feeStructureId || null }
    });
            
    if (installments && installments.length > 0) {
        // Clear existing UNPAID records to prevent duplicates
        await (prisma as any).paymentRecord.deleteMany({
            where: { enrollmentId, status: { in: ["UPCOMING", "UNPAID"] } }
        });

        // Generate absolute due dates based on Date of Joining (Today)
        const joiningDate = new Date();
        const paymentData = installments.map((inst: any) => {
            const dueDate = new Date(joiningDate);
            dueDate.setDate(dueDate.getDate() + (Number(inst.relativeDaysFromJoin) || 0));

            return {
                enrollmentId,
                amount: Number(inst.amount) || 0,
                description: inst.description || "Installment",
                dueDate: dueDate,
                status: "UPCOMING"
            };
        });

        await (prisma as any).paymentRecord.createMany({ data: paymentData });
    }

    revalidatePath('/teacher/batch-management'); 
    revalidatePath('/student/dashboard'); 
}

// 2. Mark as Paid (Includes Auto-Revoke & Receipt generation)
export async function markPaymentPaidAction(formData: FormData) {
    const paymentId = formData.get("paymentId") as string;
    const mode = formData.get("paymentMode") as string;
    const paidDate = formData.get("paidAt") as string;

    const payment = await (prisma as any).paymentRecord.update({
        where: { id: paymentId },
        data: { 
            status: "PAID", 
            paymentMode: mode, 
            paidAt: paidDate ? new Date(paidDate) : new Date() 
        },
        include: { enrollment: true }
    });

    // AUTO-REVOKE SUSPENSION
    if (payment.enrollment.status === "SUSPENDED") {
        await (prisma as any).batchEnrollment.update({
            where: { id: payment.enrollmentId },
            data: { status: "APPROVED" }
        });
    }
    
    // In production, trigger Email/SMS API here with receipt
    console.log(`Receipt sent for Payment ${paymentId}`);
    revalidatePath('/teacher/batch-management');
}

// 3. Grant an extension on a due date
export async function updatePaymentDueDateAction(paymentId: string, newDate: string) {
    if (!paymentId || !newDate) throw new Error("Payment ID and new date are required.");
    await (prisma as any).paymentRecord.update({
        where: { id: paymentId },
        data: { dueDate: new Date(newDate), status: "UPCOMING" } // Resets to UPCOMING if it was UNPAID
    });
    revalidatePath('/teacher/batch-management');
}

// 4. Suspend a student's access to the batch for non-payment
export async function suspendStudentAccessAction(enrollmentId: string, reason: string = "Overdue Fees") {
    if (!enrollmentId) throw new Error("Enrollment ID is required.");
    await (prisma as any).batchEnrollment.update({
        where: { id: enrollmentId },
        data: { status: "SUSPENDED" }
    });
    // Mock Notification
    console.log(`Suspension notice sent to Enrollment ${enrollmentId}: ${reason}`);
    revalidatePath('/teacher/batch-management');
    revalidatePath('/teacher/dashboard');
}

// 5. Reinstate student access upon payment
export async function reinstateStudentAccessAction(enrollmentId: string) {
    if (!enrollmentId) throw new Error("Enrollment ID is required.");
    await (prisma as any).batchEnrollment.update({
        where: { id: enrollmentId },
        data: { status: "APPROVED" }
    });
    revalidatePath('/teacher/batch-management');
    revalidatePath('/teacher/dashboard');
}

// 6. UPDATE: Modify an existing Fee Structure
export async function updateFeeStructureAction(id: string, data: { name: string, totalAmount: number, installments: any[] }) {
    if (!id) throw new Error("Fee Structure ID is required.");
    
    await (prisma as any).feeStructure.update({
        where: { id },
        data: {
            name: data.name,
            totalAmount: data.totalAmount,
            installments: data.installments
        }
    });

    revalidatePath('/teacher/dashboard');
    revalidatePath('/teacher/batch-management');
}
