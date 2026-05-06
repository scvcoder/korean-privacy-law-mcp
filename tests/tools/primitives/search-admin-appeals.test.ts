import { describe, it, expect } from "vitest";
import { searchAdminAppeals } from "../../../src/tools/primitives/search-admin-appeals.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("search_admin_appeals — 정의", () => {
  it("name·description", () => {
    expect(searchAdminAppeals.name).toBe("search_admin_appeals");
    expect(searchAdminAppeals.description).toContain("행정심판");
  });

  it("입력 스키마 — query 필수", () => {
    expect(() => searchAdminAppeals.inputSchema.parse({})).toThrow();
  });
});

describe.skipIf(!hasApiKey)("search_admin_appeals — 실 API", () => {
  it("'개인정보' → 재결례 매칭", async () => {
    const client = new LawApiClient();
    const result = await searchAdminAppeals.handler(
      searchAdminAppeals.inputSchema.parse({ query: "개인정보", display: 3 }),
      client
    );
    const text = result.content[0]?.text ?? "";
    if (!result.isError) {
      expect(text).toContain("행정심판 재결례");
      // case-sensitive parsing 검증 — Decc/decc 케이스 충돌 회귀 방지
      expect(text).toMatch(/\[id=\d+\]/);
    } else {
      expect(text).toContain("[NOT_FOUND]");
    }
  }, 30_000);
});
