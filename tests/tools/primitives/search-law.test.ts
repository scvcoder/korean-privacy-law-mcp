import { describe, it, expect } from "vitest";
import { searchLaw } from "../../../src/tools/primitives/search-law.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("search_law — 도구 정의", () => {
  it("name·description·schema 정의됨", () => {
    expect(searchLaw.name).toBe("search_law");
    expect(searchLaw.description).toContain("법령 검색");
    expect(searchLaw.description).toContain("개인정보");
    expect(searchLaw.description).toContain("다음");
  });

  it("입력 스키마 — query 필수, display 기본 100", () => {
    expect(() => searchLaw.inputSchema.parse({})).toThrow();
    const parsed = searchLaw.inputSchema.parse({ query: "개인정보 보호법" });
    expect(parsed.display).toBe(100);
    expect(parsed.page).toBe(1);
  });

  it("입력 스키마 — display 범위 검증", () => {
    expect(() =>
      searchLaw.inputSchema.parse({ query: "x", display: 0 })
    ).toThrow();
    expect(() =>
      searchLaw.inputSchema.parse({ query: "x", display: 101 })
    ).toThrow();
    expect(() =>
      searchLaw.inputSchema.parse({ query: "x", display: 50 })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("search_law — 실 API", () => {
  it("'개보법' 약칭 → 정규화 + 결과 반환", async () => {
    const client = new LawApiClient();
    const result = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개보법" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("개인정보 보호법");
    expect(text).toContain("정규화: 개인정보 보호법");
    expect(text).toContain("이어서 할 수 있는 조회");
  }, 30_000);

  it("'상법' display=100 → 회수 (짧은 법령명 quirk)", async () => {
    const client = new LawApiClient();
    const result = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "상법" }),
      client
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("상법");
  }, 30_000);

  it("결과 없는 쿼리 → [NOT_FOUND] + suggestions", async () => {
    const client = new LawApiClient();
    const result = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "xyzqwer1234noexistlaw" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
    expect(result.content[0]?.text).toContain("intelligent_law_search");
  }, 30_000);
});
