import prisma from "../src/lib/prisma";

async function test() {
  console.log("Prisma Keys:", Object.keys(prisma).filter(k => !k.startsWith("_")));
  process.exit(0);
}

test();
