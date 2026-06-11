import { describe, expect, it } from "vitest";

import { pickAvailablePosition } from "./binaryPlacementService.js";

describe("pickAvailablePosition", () => {
  it("uses sponsor preferred LEFT first when available", () => {
    expect(pickAvailablePosition("LEFT", [], true)).toBe("LEFT");
  });

  it("falls back to RIGHT when sponsor preferred LEFT is occupied", () => {
    expect(pickAvailablePosition("LEFT", ["LEFT"], true)).toBe("RIGHT");
  });

  it("uses LEFT first for non-sponsor candidates", () => {
    expect(pickAvailablePosition("RIGHT", [], false)).toBe("LEFT");
  });

  it("returns null when both positions are already occupied", () => {
    expect(pickAvailablePosition("LEFT", ["LEFT", "RIGHT"], true)).toBeNull();
  });
});
