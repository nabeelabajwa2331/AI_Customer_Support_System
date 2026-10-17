import { prisma } from '../../src/lib/prisma.js';

/**
 * Remove all application rows so each test starts from a known state.
 * Only used against the isolated test schema.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}
