import { describe, expect, it } from "vitest";

import { AppError } from "../domain/errors.js";
import { extractBearerToken } from "./sessionAuth.js";

describe("extractBearerToken", () => {
  it("extracts the bearer token", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("rejects missing authorization header", () => {
    expect(() => extractBearerToken(undefined)).toThrowError(AppError);
    expect(() => extractBearerToken(undefined)).toThrowError("Missing Authorization header");
  });

  it("rejects invalid authorization format", () => {
    expect(() => extractBearerToken("Token abc123")).toThrowError(AppError);
    expect(() => extractBearerToken("Bearer   ")).toThrowError(AppError);
  });
});
