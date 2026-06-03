const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        const userId = "clwv9y..."; // I need a real ID. I'll fetch first.
        const user = await prisma.user.findFirst();
        if (!user) { console.log("No user found"); return; }
        
        console.log(`Testing with user: ${user.id} (${user.role})`);
        
        const res = await prisma.question.create({
            data: {
                content: "Test AI Question from Scratch",
                options: ["A", "B", "C", "D"],
                correctAnswer: "A",
                explanation: "Test explanation",
                tags: ["AI-Generated"],
                type: "SINGLE_CHOICE",
                difficulty: "MEDIUM",
                subject: "Mathematics",
                class: "Class 11/12",
                topic: "Test Topic",
                subTopic: "Test Subtopic",
                status: "APPROVED",
                createdById: user.id
            }
        });
        console.log("Save Success!", res.id);
    } catch (err) {
        console.error("Save Error:", err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
