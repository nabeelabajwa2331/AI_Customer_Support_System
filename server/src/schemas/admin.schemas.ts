import { z } from 'zod';

const role = z.enum(['CUSTOMER', 'SUPPORT_AGENT', 'ADMIN']);

export const userIdParamsSchema = z.object({ id: z.string().uuid('Invalid user id') });

export const listUsersQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
  role: role.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateUserRoleSchema = z.object({ role });

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
