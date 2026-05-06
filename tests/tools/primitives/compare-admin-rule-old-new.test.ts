import { describe, it, expect } from "vitest";
import { compareAdminRuleOldNew } from "../../../src/tools/primitives/compare-admin-rule-old-new.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("compare_admin_rule_old_new — 정의", () => {
  it("name·description", () => {
    expect(compareAdminRuleOldNew.name).toBe("compare_admin_rule_old_new");
    expect(compareAdminRuleOldNew.description).toContain("신구법 비교");
    expect(compareAdminRuleOldNew.description).toContain("PIPC");
  });

  it("입력 스키마 — mst 필수", () => {
    expect(() => compareAdminRuleOldNew.inputSchema.parse({})).toThrow();
    expect(() =>
      compareAdminRuleOldNew.inputSchema.parse({ mst: "2100000265956" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("compare_admin_rule_old_new — 실 API", () => {
  it("PIPC 안전성 확보조치 기준 (mst=2100000265956) 신구 비교", async () => {
    const client = new LawApiClient();
    const result = await compareAdminRuleOldNew.handler(
      compareAdminRuleOldNew.inputSchema.parse({ mst: "2100000265956" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보의 안전성 확보조치 기준");
    expect(body).toContain("신구법 비교");
    expect(body).toMatch(/\[구조문\]|\[신조문\]/);
    // <P>...</P> → **...** 강조 변환 검증 (변경 부분 표시)
    expect(body).toMatch(/\*\*[^*]+\*\*/);
  }, 60_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await compareAdminRuleOldNew.handler(
      compareAdminRuleOldNew.inputSchema.parse({ mst: "999999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
