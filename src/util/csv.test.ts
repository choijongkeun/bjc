import { describe, expect, it } from "vitest";
import { buildCsv, escapeCsvCell } from "./csv.js";

describe("csv", () => {
  it("keeps numeric strings intact", () => {
    expect(escapeCsvCell("1000")).toBe("1000");
    expect(escapeCsvCell("-1000")).toBe("-1000");
  });

  it("prefixes risky spreadsheet formulas", () => {
    expect(escapeCsvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(escapeCsvCell("@malicious")).toBe("'@malicious");
  });

  it("quotes cells after formula sanitizing when needed", () => {
    expect(escapeCsvCell('=1,"oops"')).toBe(`"'=1,""oops"""`);
  });

  it("builds csv rows with sanitized values", () => {
    expect(
      buildCsv([
        {
          amount_base: "1000",
          memo: "=unsafe",
        },
      ])
    ).toBe("amount_base,memo\n1000,'=unsafe");
  });
});
