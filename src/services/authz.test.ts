import { describe, expect, it } from "vitest";

import { assertRoleAtLeast } from "./authz.js";

describe("assertRoleAtLeast", () => {
  it("allows READER and ADMIN on reader endpoints", () => {
    expect(() => assertRoleAtLeast({ id: "reader", role: "READER" }, "READER")).not.toThrow();
    expect(() => assertRoleAtLeast({ id: "admin", role: "ADMIN" }, "READER")).not.toThrow();
  });

  it("blocks USER on reader endpoints", () => {
    expect(() => assertRoleAtLeast({ id: "user", role: "USER" }, "READER")).toThrow();
  });

  it("blocks non-admin on admin endpoints", () => {
    expect(() => assertRoleAtLeast({ id: "reader", role: "READER" }, "ADMIN")).toThrow();
    expect(() => assertRoleAtLeast({ id: "user", role: "USER" }, "ADMIN")).toThrow();
  });
});

