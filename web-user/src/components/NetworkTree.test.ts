import { describe, expect, it } from "vitest";
import { flattenNetworkTree } from "@/components/NetworkTree";

describe("NetworkTree helpers", () => {
  it("flattens nested nodes with level metadata", () => {
    const rows = flattenNetworkTree({
      key: "root",
      accountId: "root",
      loginId: "root-user",
      displayName: "Root",
      depth: 0,
      position: null,
      rootLeg: null,
      children: [
        {
          key: "child-1",
          accountId: "child-1",
          loginId: "child-user",
          displayName: "Child",
          depth: 1,
          position: "LEFT",
          rootLeg: "LEFT",
          children: [],
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.level).toBe(0);
    expect(rows[1]?.level).toBe(1);
    expect(rows[1]?.position).toBe("LEFT");
  });
});
