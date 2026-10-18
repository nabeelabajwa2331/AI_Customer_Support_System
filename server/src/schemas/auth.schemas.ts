import { z } from 'zod';

// Trims, validates a basic shape, and lower-cases so uniqueness is case-insensitive.
const emailSchema = z
  .string()
  .trim()
  .min(3, 'A valid email address is required')
  .max(255, 'Email must be at most 255 characters')
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: 'A valid email address is required',
  })
  .transform((value) => value.toLowerCase());

// bcrypt only uses the first 72 bytes; cap length to avoid silently ignored input.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(72),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
