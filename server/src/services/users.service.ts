import type { Prisma, Role } from '@prisma/client';

import { AppError, forbidden } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

/** User row as shown to administrators (never includes `passwordHash`). */
export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
  questionCount: number;
  documentCount: number;
}

export interface UserListResult {
  users: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
  roleCounts: Record<Role, number>;
}

export interface UserListQuery {
  search?: string;
  role?: Role;
  page: number;
  pageSize: number;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { chatLogs: true, knowledgeDocuments: true } },
} as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toSummary(row: UserRow): AdminUserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    questionCount: row._count.chatLogs,
    documentCount: row._count.knowledgeDocuments,
  };
}

function userNotFound(): AppError {
  return new AppError(404, 'USER_NOT_FOUND', 'User not found');
}

export async function listUsers(query: UserListQuery): Promise<UserListResult> {
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
  ]);

  const roleCounts: Record<Role, number> = { CUSTOMER: 0, SUPPORT_AGENT: 0, ADMIN: 0 };
  for (const group of grouped) roleCounts[group.role] = group._count._all;

  return {
    users: rows.map(toSummary),
    total,
    page: query.page,
    pageSize: query.pageSize,
    roleCounts,
  };
}

/**
 * Changes another user's role. Administrators cannot change their own role,
 * and the last administrator can never be demoted, so the system always keeps
 * at least one admin. The new role applies on the user's next request, because
 * authentication reads the role from the database.
 */
export async function updateUserRole(
  actorId: string,
  userId: string,
  role: Role,
): Promise<AdminUserSummary> {
  if (actorId === userId) {
    throw forbidden('You cannot change your own role. Ask another administrator.');
  }

  // Serializable so two admins demoting each other at once cannot both succeed.
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!target) throw userNotFound();

      if (target.role === 'ADMIN' && role !== 'ADMIN') {
        const admins = await tx.user.count({ where: { role: 'ADMIN' } });
        if (admins <= 1) {
          throw new AppError(409, 'LAST_ADMIN', 'The last administrator cannot be demoted.');
        }
      }

      const updated = await tx.user.update({ where: { id: userId }, data: { role }, select: userSelect });
      return toSummary(updated);
    },
    { isolationLevel: 'Serializable' },
  );
}

/**
 * Deletes another user's account. Their sessions are removed with the account;
 * documents they uploaded and their question history stay, with the author
 * cleared, so the knowledge base and analytics are unaffected.
 */
export async function deleteUser(actorId: string, userId: string): Promise<void> {
  if (actorId === userId) {
    throw forbidden('You cannot delete your own account here.');
  }

  await prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!target) throw userNotFound();

      if (target.role === 'ADMIN') {
        const admins = await tx.user.count({ where: { role: 'ADMIN' } });
        if (admins <= 1) {
          throw new AppError(409, 'LAST_ADMIN', 'The last administrator cannot be deleted.');
        }
      }

      await tx.user.delete({ where: { id: userId } });
    },
    { isolationLevel: 'Serializable' },
  );
}
