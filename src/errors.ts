/**
 * Base error class for all RTLS SDK errors
 */
export class RtlsError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  public readonly code: string;

  constructor(message: string, status: number, body: unknown, code?: string) {
    super(message);
    this.name = 'RtlsError';
    this.status = status;
    this.body = body;
    this.code = code ?? 'RTLS_ERROR';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RtlsError);
    }
  }

  isStatus(status: number): boolean {
    return this.status === status;
  }

  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }
}

export class AuthenticationError extends RtlsError {
  constructor(message = 'Authentication failed', body?: unknown) {
    super(message, 401, body, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends RtlsError {
  constructor(message = 'Access denied', body?: unknown) {
    super(message, 403, body, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends RtlsError {
  constructor(message = 'Resource not found', body?: unknown) {
    super(message, 404, body, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends RtlsError {
  public readonly errors: Record<string, string[]>;

  constructor(message = 'Validation failed', body?: unknown) {
    super(message, 422, body, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.errors = this.extractErrors(body);
  }

  private extractErrors(body: unknown): Record<string, string[]> {
    if (body && typeof body === 'object' && 'errors' in body) {
      return body.errors as Record<string, string[]>;
    }
    return {};
  }
}

export class RateLimitError extends RtlsError {
  public readonly retryAfter?: number;

  constructor(message = 'Rate limit exceeded', body?: unknown, retryAfter?: number) {
    super(message, 429, body, 'RATE_LIMIT');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class TimeoutError extends RtlsError {
  constructor(message = 'Request timed out') {
    super(message, 0, null, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends RtlsError {
  public readonly networkCause?: Error;

  constructor(message = 'Network error', cause?: Error) {
    super(message, 0, null, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    this.networkCause = cause;
  }
}

export function createError(status: number, body: unknown, message?: string): RtlsError {
  const defaultMessage = typeof body === 'object' && body !== null && 'error' in body
    ? String((body as { error: unknown }).error)
    : `HTTP ${status} error`;

  const errorMessage = message ?? defaultMessage;

  switch (status) {
    case 401:
      return new AuthenticationError(errorMessage, body);
    case 403:
      return new AuthorizationError(errorMessage, body);
    case 404:
      return new NotFoundError(errorMessage, body);
    case 422:
    case 400:
      return new ValidationError(errorMessage, body);
    case 429:
      return new RateLimitError(errorMessage, body);
    default:
      return new RtlsError(errorMessage, status, body);
  }
}
