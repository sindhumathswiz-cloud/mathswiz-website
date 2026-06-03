import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import bcrypt from 'bcryptjs';

async function main() {
    const { default: prisma } = await import('./prisma');
    console.log('--- RESTORING MOCK USERS & QUESTION BANK ---');

    // 1. Restore Users
    const password = await bcrypt.hash('password123', 10);
    
    // Students
    const student1 = await prisma.user.upsert({
        where: { email: 'student1@mathswiz.local' },
        update: {},
        create: {
            email: 'student1@mathswiz.local',
            firstName: 'Aarav',
            lastName: 'Sharma',
            password,
            role: 'STUDENT',
            subscription: 'FREE',
            aiTokens: 10,
            accountStatus: 'APPROVED'
        }
    });

    const student2 = await prisma.user.upsert({
        where: { email: 'student2@mathswiz.local' },
        update: {},
        create: {
            email: 'student2@mathswiz.local',
            firstName: 'Priya',
            lastName: 'Patel',
            password,
            role: 'STUDENT',
            subscription: 'PREMIUM',
            aiTokens: 100,
            accountStatus: 'APPROVED'
        }
    });

    // Teacher
    const teacher = await prisma.user.upsert({
        where: { email: 'teacher@mathswiz.local' },
        update: {},
        create: {
            email: 'teacher@mathswiz.local',
            firstName: 'Sindhu',
            lastName: 'Mam',
            password,
            role: 'TEACHER',
            accountStatus: 'APPROVED'
        }
    });

    // 2. Add some Question Bank Content
    const mockQuestions = [
        {
            content: "What is the integral of $e^x \\sin(x)$ with respect to $x$?",
            options: [
                "$\\frac{e^x(\\sin x - \\cos x)}{2} + C$",
                "$\\frac{e^x(\\cos x - \\sin x)}{2} + C$",
                "$e^x(\\sin x + \\cos x) + C$",
                "$e^x\\sin x - e^x\\cos x + C$"
            ],
            correctAnswer: "$\\frac{e^x(\\sin x - \\cos x)}{2} + C$",
            explanation: "Using integration by parts twice yields the formula $I = \\frac{e^x(\\sin x - \\cos x)}{2} + C$.",
            class: "Class 12",
            subject: "Mathematics",
            topic: "Calculus",
            subTopic: "Integration",
            difficulty: "HARD",
            type: "SINGLE_CHOICE",
            tags: ["Integration_By_Parts", "Calculus"],
            status: "APPROVED",
            createdById: teacher.id
        },
        {
            content: "Let $A$ be a $3 \\times 3$ matrix such that $|A| = 4$. What is the value of $|2A|$?",
            options: ["8", "16", "32", "64"],
            correctAnswer: "32",
            explanation: "For an $n \\times n$ matrix $A$, $|kA| = k^n|A|$. Here $n=3, k=2$. $|2A| = 2^3 \\times 4 = 8 \\times 4 = 32$.",
            class: "Class 12",
            subject: "Mathematics",
            topic: "Matrices and Determinants",
            subTopic: "Properties of Determinants",
            difficulty: "MEDIUM",
            type: "SINGLE_CHOICE",
            tags: ["Determinants", "Algebra"],
            status: "APPROVED",
            createdById: teacher.id
        },
        {
            content: "Find the dot product of vectors $\\mathbf{a} = 2\\hat{i} + 3\\hat{j} - \\hat{k}$ and $\\mathbf{b} = \\hat{i} - 2\\hat{j} + 3\\hat{k}$.",
            options: ["-7", "0", "7", "5"],
            correctAnswer: "-7",
            explanation: "$\\mathbf{a} \\cdot \\mathbf{b} = (2)(1) + (3)(-2) + (-1)(3) = 2 - 6 - 3 = -7$.",
            class: "Class 12",
            subject: "Mathematics",
            topic: "Vectors",
            subTopic: "Dot Product",
            difficulty: "EASY",
            type: "SINGLE_CHOICE",
            tags: ["Vectors", "DotProduct"],
            status: "APPROVED",
            createdById: teacher.id
        },
        {
            content: "What is the derivative of $\\ln(\\cos x)$?",
            options: ["$-\\tan x$", "$\\tan x$", "$-\\cot x$", "$\\cot x$"],
            correctAnswer: "$-\\tan x$",
            explanation: "By the chain rule: $d/dx [\\ln(\\cos x)] = \\frac{1}{\\cos x} \\times (-\\sin x) = -\\tan x$.",
            class: "Class 12",
            subject: "Mathematics",
            topic: "Calculus",
            subTopic: "Differentiation",
            difficulty: "EASY",
            type: "SINGLE_CHOICE",
            tags: ["ChainRule", "Trigonometry"],
            status: "APPROVED",
            createdById: teacher.id
        },
        {
            content: "What are the roots of the equation $x^2 - 5x + 6 = 0$?",
            options: ["2, -3", "-2, -3", "2, 3", "-2, 3"],
            correctAnswer: "2, 3",
            explanation: "$x^2 - 5x + 6 = (x-2)(x-3) = 0 \\implies x=2, x=3$.",
            class: "Class 11",
            subject: "Mathematics",
            topic: "Algebra",
            subTopic: "Quadratic Equations",
            difficulty: "EASY",
            type: "SINGLE_CHOICE",
            tags: ["Roots", "Algebra"],
            status: "APPROVED",
            createdById: teacher.id
        }
    ];

    for (const q of mockQuestions) {
        await prisma.question.create({
            data: q as any
        });
    }

    console.log(`Restored 3 users (Student, Premium, Teacher)`);
    console.log(`Restored ${mockQuestions.length} core mathematics questions to the bank!`);
    
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
