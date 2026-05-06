import { describe, it, expect } from "vitest";
import { searchPrivacyCases } from "../../../src/tools/corpus/search-privacy-cases.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";

const client = new LawApiClient({ apiKey: "unused-corpus-only" });

describe("search_privacy_cases — 정의", () => {
  it("name·description", () => {
    expect(searchPrivacyCases.name).toBe("search_privacy_cases");
    expect(searchPrivacyCases.description).toContain("1,745");
    expect(searchPrivacyCases.description).toContain("category");
  });

  it("스키마 — query 필수, 모든 카테고리 옵셔널", () => {
    expect(() => searchPrivacyCases.inputSchema.parse({})).toThrow();
    expect(() =>
      searchPrivacyCases.inputSchema.parse({ query: "x" })
    ).not.toThrow();
  });

  it("year_min/year_max 4자리 숫자 검증", () => {
    expect(() =>
      searchPrivacyCases.inputSchema.parse({ query: "x", year_min: "12" })
    ).toThrow();
    expect(() =>
      searchPrivacyCases.inputSchema.parse({ query: "x", year_min: "2012" })
    ).not.toThrow();
  });
});

describe("search_privacy_cases — 검색 + 카테고리 필터", () => {
  it("'환자 동의' → 의료 분야 사례", async () => {
    const r = await searchPrivacyCases.handler(
      searchPrivacyCases.inputSchema.parse({
        query: "환자 동의",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("상담사례");
    expect(text).toMatch(/카테고리:.*보건·의료/);
    expect(text).toContain("📎 출처: 개인정보보호위원회");
  }, 15_000);

  it("category3='보건·의료' 필터링 — 모든 결과가 보건·의료", async () => {
    const r = await searchPrivacyCases.handler(
      searchPrivacyCases.inputSchema.parse({
        query: "동의",
        category3: "보건·의료",
        display: 5,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    // 모든 항목의 category3이 보건·의료 (필터 적용)
    const categoryLines = text.match(/카테고리: [^\n]+/g) ?? [];
    expect(categoryLines.length).toBeGreaterThan(0);
    for (const line of categoryLines) {
      expect(line).toContain("보건·의료");
    }
  }, 15_000);

  it("year_min='2020' year_max='2023' 연도 필터", async () => {
    const r = await searchPrivacyCases.handler(
      searchPrivacyCases.inputSchema.parse({
        query: "개인정보",
        year_min: "2020",
        year_max: "2023",
        display: 5,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    // 응답에 (YYYY) 표기되는 연도가 모두 2020~2023
    const years = [...text.matchAll(/\((\d{4})\)/g)].map((m) => m[1]);
    expect(years.length).toBeGreaterThan(0);
    for (const y of years) {
      if (y) {
        expect(parseInt(y, 10)).toBeGreaterThanOrEqual(2020);
        expect(parseInt(y, 10)).toBeLessThanOrEqual(2023);
      }
    }
  }, 15_000);

  it("필터 적용 시 응답에 필터 표시", async () => {
    const r = await searchPrivacyCases.handler(
      searchPrivacyCases.inputSchema.parse({
        query: "동의",
        category1: "개인정보처리자(민간)",
        category3: "금융",
        display: 3,
      }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("필터:");
    expect(text).toContain("처리자=개인정보처리자(민간)");
    expect(text).toContain("분야=금융");
  }, 15_000);

  it("매칭 0건 → [NOT_FOUND_SCOPE]", async () => {
    const r = await searchPrivacyCases.handler(
      searchPrivacyCases.inputSchema.parse({
        query: "zzqwerxy123nonsensetoken987",
      }),
      client
    );
    expect(r.content[0]?.text).toContain("[NOT_FOUND_SCOPE]");
  }, 15_000);
});
