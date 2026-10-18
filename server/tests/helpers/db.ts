import { prisma } from '../../src/lib/prisma.js';

// Clears application rows between tests (isolated test schema only).
export async function resetDatabase(): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}
