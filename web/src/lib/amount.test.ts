import { describe, expect, it } from "vitest";
import { formatBaseAmount, formatTokenAmount } from "./amount";

describe("formatBaseAmount", () => {
  it("formats decimal token amounts", () => {
    expect(formatBaseAmount("123456789", 6)).toBe("123.4567");
  });

  it("formats zero-decimal integers", () => {
    expect(formatBaseAmount("123456", 0)).toBe("123,456");
  });

  it("appends token symbol", () => {
    expect(formatTokenAmount("500000000", 6, "USDC")).toBe("500 USDC");
  });
});
