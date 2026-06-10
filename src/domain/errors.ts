export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function forbidden(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("FORBIDDEN", message, 403, details);
}

export function unauthorized(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("UNAUTHORIZED", message, 401, details);
}

export function validationError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("VALIDATION_ERROR", message, 422, details);
}

export function unprocessableEntity(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("UNPROCESSABLE_ENTITY", message, 422, details);
}

export function conflictError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("CONFLICT", message, 409, details);
}

export function notFound(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("NOT_FOUND", message, 404, details);
}
