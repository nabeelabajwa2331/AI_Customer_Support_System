import { PrismaClient } from '@prisma/client';

import { isProduction } from '../config/env.js';

// Cached on globalThis so dev hot-reload does not create a new client per reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
