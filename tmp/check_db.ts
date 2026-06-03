
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const teacherEmail = "sindhu@sindhusmathswizclasses.com";
    
    console.log("--- 🕵️ DATABASE DIAGNOSTIC ---");
    
    const teacher = await prisma.user.findUnique({
        where: { email: teacherEmail }
    });
    
    if (!teacher) {
        console.error("❌ Teacher 'Sindhu' not found in database!");
        return;
    }
    
    console.log(`✅ Teacher Found: ${teacher.email} (ID: ${teacher.id})`);
    
    const batches = await prisma.batch.findMany({
        where: { teacherId: teacher.id }
    });
    
    console.log(`📦 Batches found for teacher: ${batches.length}`);
    batches.forEach(b => {
        console.log(`   - Batch: ${b.name} (Code: ${b.code}, ID: ${b.id})`);
    });
    
    if (batches.length > 0) {
        const batchIds = batches.map(b => b.id);
        const enrollments = await prisma.batchEnrollment.findMany({
            where: { batchId: { in: batchIds } },
            include: { student: true }
        });
        
        console.log(`👨‍🎓 Total Enrollments found: ${enrollments.length}`);
        enrollments.forEach(e => {
            console.log(`   - Student: ${e.student.email} in Batch ID: ${e.batchId}`);
        });
    }

    const allUsers = await prisma.user.findMany({
      where: { role: 'STUDENT' }
    });
    console.log(`📊 Global Student Count in DB: ${allUsers.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
