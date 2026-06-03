import prisma from '../src/lib/prisma';

async function main() {
    console.log("Wiping all ingestion jobs...");
    const result = await prisma.ingestionJob.deleteMany({});
    console.log(`Deleted ${result.count} stuck ingestion jobs.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
