import { describe, it, expect } from "vitest";
import { searchConstitutionalDecisions } from "../../../src/tools/primitives/search-constitutional-decisions.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("search_constitutional_decisions — 정의", () => {
  it("name·description", () => {
    expect(searchConstitutionalDecisions.name).toBe(
      "search_constitutional_decisions"
    );
    expect(searchConstitutionalDecisions.description).toContain("헌법재판소");
  });

  it("입력 스키마 — query 필수", () => {
    expect(() =>
      searchConstitutionalDecisions.inputSchema.parse({})
    ).toThrow();
  });
});

describe.skipIf(!hasApiKey)("search_constitutional_decisions — 실 API", () => {
  it("'개인정보' → detc itemTag 대문자 quirk 정상 처리", async () => {
    const client = new LawApiClient();
    const result = await searchConstitutionalDecisions.handler(
      searchConstitutionalDecisions.inputSchema.parse({
        query: "개인정보",
        display: 3,
      }),
      client
    );
    // detc는 결과 0~소수 — 둘 다 OK
    const text = result.content[0]?.text ?? "";
    if (!result.isError) {
      expect(text).toContain("헌재 결정례");
      expect(text).toMatch(/사건번호:/);
    } else {
      expect(text).toContain("[NOT_FOUND]");
    }
  }, 30_000);
});
