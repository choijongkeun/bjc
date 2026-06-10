import { MulterError } from "multer";
import { ZodError } from "zod";

import { AppError, unprocessableEntity } from "../domain/errors.js";

export function toHttpError(err: unknown): { status: number; body: unknown } {
  if (err instanceof SyntaxError && String((err as any).message ?? "").toLowerCase().includes("json")) {
    return {
      status: 400,
      body: { error: { code: "BAD_REQUEST", message: "Invalid JSON" } }
    };
  }

  if (err instanceof ZodError) {
    const details = err.flatten();
    const appErr = unprocessableEntity("Invalid request", { issues: details });
    return {
      status: appErr.status,
      body: { error: { code: appErr.code, message: appErr.message, details: appErr.details ?? null } }
    };
  }

  if (err instanceof MulterError) {
    const appErr = unprocessableEntity("Invalid multipart upload", { code: err.code, field: err.field ?? null });
    return {
      status: appErr.status,
      body: { error: { code: appErr.code, message: appErr.message, details: appErr.details ?? null } }
    };
  }

  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details ?? null } }
    };
  }

  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Internal server error" } }
  };
}
