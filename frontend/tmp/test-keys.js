const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

console.log("KEYS:", Object.keys(prisma).filter(k => !k.startsWith("_")));
prisma.$disconnect();
