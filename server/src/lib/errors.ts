import { ZodError } from 'zod';

// Serialized by the central error handler; only these fields reach clients.
export class AppError extends Error {
  /** HTTP status code to send. */
  readonly status: number;
  /** Stable, machine-readable error code (safe to expose). */
  readonly code: string;
  /** Optional structured context (e.g. field-level validation errors). */
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Deliberately vague so it never reveals whether an email exists.
export function unauthorized(message = 'Invalid credentials'): AppError {
  return new AppError(401, 'UNAUTHENTICATED', message);
}

export function forbidden(message = 'You do not have permission to perform this action'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function conflict(message: string): AppError {
  return new AppError(409, 'CONFLICT', message);
}

export function validationFailed(details: unknown): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details);
}

export function validationFailedFromZod(error: ZodError): AppError {
  return validationFailed(
    error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  );
}
