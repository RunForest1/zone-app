import { PrismaClient } from "@prisma/client";

// Один экземпляр Prisma на процесс: иначе HMR в dev плодит подключения.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
