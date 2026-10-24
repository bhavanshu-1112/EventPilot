/**
 * Typed application errors with HTTP status, error code, and a safe message
 * that can be shown to the user without leaking internals.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPLOAD_ERROR'
  | 'LLM_ERROR'
  | 'LLM_VALIDATION_ERROR'
  | 'LLM_RATE_LIMITED'
  | 'LLM_SPEND_CAP'
  | 'BUDGET_VIOLATION'
  | 'SCHEDULE_CONFLICT'
  | 'NOTIFICATION_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly safeMessage: string;
  public readonly details?: Record<string, unknown>;

  constructor(params: {
    code: ErrorCode;
    httpStatus: number;
    message: string;
    safeMessage: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'AppError';
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.safeMessage = params.safeMessage;
    this.details = params.details;
  }

  /** Convert to the standard error envelope for API responses */
  toEnvelope(requestId?: string): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.safeMessage,
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
  };
}

// ── Factory helpers ──────────────────────────────────────────────────

export function validationError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'VALIDATION_ERROR',
    httpStatus: 400,
    message,
    safeMessage: message,
    details,
  });
}

export function notFoundError(resource: string): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    httpStatus: 404,
    message: `${resource} not found`,
    safeMessage: `${resource} not found`,
  });
}

export function unauthorizedError(message = 'Invalid or missing access token'): AppError {
  return new AppError({
    code: 'UNAUTHORIZED',
    httpStatus: 401,
    message,
    safeMessage: message,
  });
}

export function rateLimitedError(retryAfterSeconds?: number): AppError {
  return new AppError({
    code: 'RATE_LIMITED',
    httpStatus: 429,
    message: 'Too many requests',
    safeMessage: 'Too many requests. Please try again later.',
    details: retryAfterSeconds ? { retryAfterSeconds } : undefined,
  });
}

export function internalError(message: string, cause?: unknown): AppError {
  return new AppError({
    code: 'INTERNAL_ERROR',
    httpStatus: 500,
    message,
    safeMessage: 'An unexpected error occurred. Please try again.',
    cause,
  });
}
