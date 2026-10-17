/**
 * Typed application error. Thrown anywhere in the request lifecycle and
 * serialized by the central error handler.
 *
 * Only safe, non-sensitive fields are exposed to clients.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'BAD_REQUEST', message, details);

/**
 * Deliberately generic: authentication failures must not reveal whether an
 * email exists or which factor failed.
 */
export const unauthorized = (message = 'Invalid credentials'): AppError =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have permission to perform this action'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const conflict = (message: string): AppError => new AppError(409, 'CONFLICT', message);
