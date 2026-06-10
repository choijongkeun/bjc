import { validationError } from "./errors.js";

export function assertIntString(name: string, value: string): void {
  if (!/^-?\d+$/.test(value)) {
    throw validationError(`${name} must be an integer string`, { name, value });
  }
}

export function assertNonNegativeIntString(name: string, value: string): void {
  assertIntString(name, value);
  if (value.startsWith("-")) {
    throw validationError(`${name} must be non-negative`, { name, value });
  }
}

