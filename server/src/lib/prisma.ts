import { PrismaClient } from '@prisma/client';

import { isProduction } from '../config/env.js';

/**
 * Single shared PrismaClient instance.
 *
 * In development, hot-reloading would otherwise create a new client (and a new
 * connection pool) on every reload, so we cache it on `globalThis`.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
