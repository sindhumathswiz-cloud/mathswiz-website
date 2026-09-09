"use server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit-log";

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

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.role) throw new Error("Unauthorized");
    const ownedPayment = await (prisma as any).paymentRecord.findFirst({
        where: {
            id: paymentId,
            ...(session.user.role === "ADMIN" ? {} : { enrollment: { batch: { teacherId: session.user.id } } }),
        },
        select: { id: true },
    });
    if (!ownedPayment) throw new Error("Payment not found or not owned by you.");

    const payment = await (prisma as any).paymentRecord.update({
        where: { id: ownedPayment.id },
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
    
    await (prisma as any).notification.create({
        data: {
            userId: payment.enrollment.studentId,
            title: "Payment recorded",
            message: "Your fee payment has been recorded successfully.",
            type: "FEE_DUE",
        },
    });
    await recordAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "PAYMENT_MARKED_PAID",
        entityType: "PaymentRecord",
        entityId: payment.id,
        metadata: { paymentMode: mode, enrollmentId: payment.enrollmentId },
    });
    revalidatePath('/teacher/batch-management');
}

// 3. Grant an extension on a due date
export async function updatePaymentDueDateAction(paymentId: string, newDate: string) {
    if (!paymentId || !newDate) throw new Error("Payment ID and new date are required.");
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.role) throw new Error("Unauthorized");
    const payment = await (prisma as any).paymentRecord.findFirst({
        where: {
            id: paymentId,
            ...(session.user.role === "ADMIN" ? {} : { enrollment: { batch: { teacherId: session.user.id } } }),
        },
        select: { id: true },
    });
    if (!payment) throw new Error("Payment not found or not owned by you.");
    await (prisma as any).paymentRecord.update({
        where: { id: payment.id },
        data: { dueDate: new Date(newDate), status: "UPCOMING" } // Resets to UPCOMING if it was UNPAID
    });
    await recordAuditLog({
        actorId: session.user.id, actorRole: session.user.role,
        action: "PAYMENT_DUE_DATE_CHANGED", entityType: "PaymentRecord", entityId: payment.id,
        metadata: { dueDate: newDate },
    });
    revalidatePath('/teacher/batch-management');
}

// 4. Suspend a student's access to the batch for non-payment
export async function suspendStudentAccessAction(enrollmentId: string, reason: string = "Overdue Fees") {
    if (!enrollmentId) throw new Error("Enrollment ID is required.");
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.role) throw new Error("Unauthorized");
    const enrollment = await (prisma as any).batchEnrollment.findFirst({
        where: {
            id: enrollmentId,
            ...(session.user.role === "ADMIN" ? {} : { batch: { teacherId: session.user.id } }),
        },
        select: { id: true, studentId: true },
    });
    if (!enrollment) throw new Error("Enrollment not found or not owned by you.");
    await (prisma as any).batchEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "SUSPENDED" }
    });
    await (prisma as any).notification.create({
        data: {
            userId: enrollment.studentId,
            title: "Batch access suspended",
            message: reason,
            type: "SYSTEM",
        },
    });
    await recordAuditLog({
        actorId: session.user.id, actorRole: session.user.role,
        action: "ENROLLMENT_SUSPENDED", entityType: "BatchEnrollment", entityId: enrollment.id,
        metadata: { reason },
    });
    revalidatePath('/teacher/batch-management');
    revalidatePath('/teacher/dashboard');
}

// 5. Reinstate student access upon payment
export async function reinstateStudentAccessAction(enrollmentId: string) {
    if (!enrollmentId) throw new Error("Enrollment ID is required.");
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.role) throw new Error("Unauthorized");
    const enrollment = await (prisma as any).batchEnrollment.findFirst({
        where: {
            id: enrollmentId,
            ...(session.user.role === "ADMIN" ? {} : { batch: { teacherId: session.user.id } }),
        },
        select: { id: true },
    });
    if (!enrollment) throw new Error("Enrollment not found or not owned by you.");
    await (prisma as any).batchEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "APPROVED" }
    });
    await recordAuditLog({
        actorId: session.user.id, actorRole: session.user.role,
        action: "ENROLLMENT_REINSTATED", entityType: "BatchEnrollment", entityId: enrollment.id,
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
