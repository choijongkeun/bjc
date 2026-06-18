import { describe, expect, it } from "vitest";
import { formatBaseAmount, formatMaybeZeroAmount } from "@/lib/amount";

describe("formatBaseAmount", () => {
  it("formats decimal strings safely", () => {
    expect(formatBaseAmount("123456789", 6)).toBe("123.4567");
  });

  it("formats zero decimal strings with separators", () => {
    expect(formatBaseAmount("123456", 0)).toBe("123,456");
  });

  it("keeps invalid strings untouched", () => {
    expect(formatBaseAmount("invalid", 0)).toBe("invalid");
  });

  it("formats zero placeholder consistently", () => {
    expect(formatMaybeZeroAmount("0")).toBe("0");
  });
});
