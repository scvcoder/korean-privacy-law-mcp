import { describe, it, expect } from "vitest";
import { getTermArticles } from "../../../src/tools/primitives/get-term-articles.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_term_articles — 정의", () => {
  it("name·description", () => {
    expect(getTermArticles.name).toBe("get_term_articles");
    expect(getTermArticles.description).toContain("법령용어");
    expect(getTermArticles.description).toContain("lstrmRltJo");
  });

  it("입력 스키마 — query 필수, maxArticles 기본 20", () => {
    expect(() => getTermArticles.inputSchema.parse({})).toThrow();
    const parsed = getTermArticles.inputSchema.parse({ query: "개인정보" });
    expect(parsed.maxArticles).toBe(20);
    expect(parsed.includeBody).toBe(true);
  });

  it("maxArticles 상한 100", () => {
    expect(() =>
      getTermArticles.inputSchema.parse({ query: "x", maxArticles: 200 })
    ).toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_term_articles — 실 API", () => {
  it("'가명정보' → 연계 조문 + lawId·jo 노출", async () => {
    const client = new LawApiClient();
    const result = await getTermArticles.handler(
      getTermArticles.inputSchema.parse({ query: "가명정보", maxArticles: 5 }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("법령용어-조문 연계");
    expect(body).toContain("가명정보");
    expect(body).toMatch(/연계 조문 \d+건/);
    expect(body).toMatch(/제\d+조/);
    expect(body).toMatch(/lawId=\d+/);
    expect(body).toMatch(/jo=\d+/);
  }, 30_000);

  it("'개인정보' → 그룹별 절단 (maxArticles=3)", async () => {
    const client = new LawApiClient();
    const result = await getTermArticles.handler(
      getTermArticles.inputSchema.parse({
        query: "개인정보",
        maxArticles: 3,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("상위 3건 표시");
    // 절단 후 표시 항목 정확히 3개여야 함
    const itemMatches = body.match(/^\s*\[\d+\] /gm) ?? [];
    expect(itemMatches.length).toBeLessThanOrEqual(3);
  }, 30_000);

  it("includeBody=false → 본문 미리보기 없음", async () => {
    const client = new LawApiClient();
    const result = await getTermArticles.handler(
      getTermArticles.inputSchema.parse({
        query: "가명정보",
        maxArticles: 3,
        includeBody: false,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("[1]");
    // 본문 토큰이 안 들어가야 함 (조문내용 안 펼침)
    expect(body).not.toMatch(/제\d+조\([^)]+\)\s*[①가-힣]/);
  }, 30_000);

  it("결과 0 → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getTermArticles.handler(
      getTermArticles.inputSchema.parse({
        query: "xyzqwerexistencequery123nonsense",
      }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
