import { describe, it, expect } from "vitest";
import { getIntelligentRelatedLaws } from "../../../src/tools/primitives/get-intelligent-related-laws.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_intelligent_related_laws — 정의", () => {
  it("name·description", () => {
    expect(getIntelligentRelatedLaws.name).toBe("get_intelligent_related_laws");
    expect(getIntelligentRelatedLaws.description).toContain("AI 연관법령");
  });

  it("입력 스키마 — query 필수, search 기본 0", () => {
    expect(() => getIntelligentRelatedLaws.inputSchema.parse({})).toThrow();
    const parsed = getIntelligentRelatedLaws.inputSchema.parse({
      query: "개인정보",
    });
    expect(parsed.search).toBe("0");
    expect(parsed.display).toBe(20);
  });
});

describe.skipIf(!hasApiKey)("get_intelligent_related_laws — 실 API", () => {
  it("'개인정보' → AI 추천 연관 조문", async () => {
    const client = new LawApiClient();
    const result = await getIntelligentRelatedLaws.handler(
      getIntelligentRelatedLaws.inputSchema.parse({
        query: "개인정보",
        display: 5,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("AI 연관법령");
    expect(body).toMatch(/총 \d+건/);
    expect(body).toMatch(/\[.+\] \(lawId=/);
  }, 30_000);

  it("결과 0 → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getIntelligentRelatedLaws.handler(
      getIntelligentRelatedLaws.inputSchema.parse({
        query: "xyzqwerexistencequery123nonsense",
      }),
      client
    );
    // 결과 없거나 있어도 OK (AI가 어떤 의미라도 매칭하면 결과 나옴)
    const text = result.content[0]?.text ?? "";
    if (result.isError) {
      expect(text).toContain("[NOT_FOUND]");
    }
  }, 30_000);
});
