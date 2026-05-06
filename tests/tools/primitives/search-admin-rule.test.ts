import { describe, it, expect } from "vitest";
import { searchAdminRule } from "../../../src/tools/primitives/search-admin-rule.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("search_admin_rule — 정의", () => {
  it("name·description", () => {
    expect(searchAdminRule.name).toBe("search_admin_rule");
    expect(searchAdminRule.description).toContain("행정규칙");
    expect(searchAdminRule.description).toContain("PIPC");
  });

  it("입력 스키마 — query 필수", () => {
    expect(() => searchAdminRule.inputSchema.parse({})).toThrow();
    expect(() =>
      searchAdminRule.inputSchema.parse({ query: "개인정보" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("search_admin_rule — 실 API", () => {
  it("'개인정보' → PIPC 고시·부처 훈령 다수 매칭", async () => {
    const client = new LawApiClient();
    const result = await searchAdminRule.handler(
      searchAdminRule.inputSchema.parse({ query: "개인정보", display: 5 }),
      client
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("행정규칙 검색");
    expect(text).toMatch(/총 \d+건/);
    expect(text).toContain("이어서 할 수 있는 조회");
  }, 30_000);
});
