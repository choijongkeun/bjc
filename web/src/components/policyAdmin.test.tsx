import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PolicyCreateModal } from "@/components/tabs/PoliciesTab";

describe("policy admin UI", () => {
  it("renders name and version fields in the policy create modal", () => {
    const html = renderToStaticMarkup(
      <PolicyCreateModal
        open
        submitting={false}
        error={null}
        form={{
          name: "",
          version: "",
          note: "",
          effective_from: "",
          effective_to: "",
        }}
        onChange={() => undefined}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />
    );

    expect(html).toContain("정책명");
    expect(html).toContain("버전");
    expect(html).toContain("예: BJC 기본 스테이킹 정책");
    expect(html).toContain("예: V1");
    expect(html).toContain("메모");
  });
});
