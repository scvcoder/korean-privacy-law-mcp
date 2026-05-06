import { describe, it, expect } from "vitest";
import { getAdminRuleText } from "../../../src/tools/primitives/get-admin-rule-text.js";
import { searchAdminRule } from "../../../src/tools/primitives/search-admin-rule.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_admin_rule_text — 정의", () => {
  it("name·description", () => {
    expect(getAdminRuleText.name).toBe("get_admin_rule_text");
    expect(getAdminRuleText.description).toContain("행정규칙 본문");
    expect(getAdminRuleText.description).toContain("PIPC");
  });

  it("입력 스키마 — mst 필수", () => {
    expect(() => getAdminRuleText.inputSchema.parse({})).toThrow();
    expect(() =>
      getAdminRuleText.inputSchema.parse({ mst: "2100000265956" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_admin_rule_text — 실 API", () => {
  it("search_admin_rule → mst → 본문 (안전성 확보조치 기준)", async () => {
    const client = new LawApiClient();

    // search로 PIPC 안전성 확보조치 기준 일련번호 획득
    const search = await searchAdminRule.handler(
      searchAdminRule.inputSchema.parse({
        query: "안전성 확보조치 기준",
        display: 5,
      }),
      client
    );
    expect(search.isError).toBeFalsy();
    const text = search.content[0]?.text ?? "";
    const mstMatch = text.match(/mst=(\d+)/);
    expect(mstMatch).toBeTruthy();
    const mst = mstMatch![1]!;

    // 본문 조회
    const result = await getAdminRuleText.handler(
      getAdminRuleText.inputSchema.parse({ mst }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("안전성 확보조치 기준");
    expect(body).toMatch(/제\d+조/);
    expect(body).toContain("개인정보보호위원회");
    expect(body).toContain("이어서 할 수 있는 조회");
  }, 60_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getAdminRuleText.handler(
      getAdminRuleText.inputSchema.parse({ mst: "9999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
