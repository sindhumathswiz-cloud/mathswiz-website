import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseSocket } from './db-socket';

const prismaClientSingleton = () => {
  // Pool settings that keep a long-running server reaching the database after the computer sleeps or the network
  // changes: each new connection's name lookup recovers on its own (lib/db-socket), idle connections are closed
  // after 30s rather than going stale, and a connection that cannot be made fails in 15s rather than hanging.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    stream: databaseSocket,
    keepAlive: true,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  return new PrismaClient({ adapter });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
