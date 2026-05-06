import { describe, it, expect } from "vitest";
import { intelligentLawSearch } from "../../../src/tools/primitives/intelligent-law-search.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("intelligent_law_search — 도구 정의", () => {
  it("name·description 정의됨", () => {
    expect(intelligentLawSearch.name).toBe("intelligent_law_search");
    expect(intelligentLawSearch.description).toContain("의미");
    expect(intelligentLawSearch.description).toContain("조문 본문");
  });

  it("입력 스키마 — search 기본 '0' (법령 조문)", () => {
    const parsed = intelligentLawSearch.inputSchema.parse({ query: "동의" });
    expect(parsed.search).toBe("0");
    expect(parsed.display).toBe(20);
  });

  it("입력 스키마 — search enum 검증", () => {
    expect(() =>
      intelligentLawSearch.inputSchema.parse({ query: "x", search: "9" })
    ).toThrow();
    expect(() =>
      intelligentLawSearch.inputSchema.parse({ query: "x", search: "2" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("intelligent_law_search — 실 API", () => {
  it("'개인정보 동의' → 법령 조문 매칭", async () => {
    const client = new LawApiClient();
    const result = await intelligentLawSearch.handler(
      intelligentLawSearch.inputSchema.parse({
        query: "개인정보 동의",
        display: 5,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("의미 검색 결과");
    expect(text).toContain("개인정보");
  }, 30_000);
});
