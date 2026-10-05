import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/server/env";

const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db =
  globalDb.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: getEnv().DATABASE_URL,
      connectionTimeoutMillis: 5000,
    }),
  });
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
