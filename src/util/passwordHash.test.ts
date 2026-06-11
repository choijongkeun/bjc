import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./passwordHash.js";

describe("passwordHash", () => {
  it("hashes without storing plain password", async () => {
    const plain = "Password123";
    const encoded = await hashPassword(plain);

    expect(encoded).not.toBe(plain);
    expect(encoded.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword(plain, encoded)).resolves.toBe(true);
  });

  it("rejects wrong passwords", async () => {
    const encoded = await hashPassword("Password123");
    await expect(verifyPassword("WrongPassword123", encoded)).resolves.toBe(false);
  });
});
