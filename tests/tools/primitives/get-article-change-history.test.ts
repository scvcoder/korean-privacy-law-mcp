import { describe, it, expect } from "vitest";
import { getArticleChangeHistory } from "../../../src/tools/primitives/get-article-change-history.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_article_change_history — 정의", () => {
  it("name·description", () => {
    expect(getArticleChangeHistory.name).toBe("get_article_change_history");
    expect(getArticleChangeHistory.description).toContain("조문별 변경 이력");
  });

  it("입력 스키마 — lawId 필수", () => {
    expect(() => getArticleChangeHistory.inputSchema.parse({})).toThrow();
    expect(() =>
      getArticleChangeHistory.inputSchema.parse({ lawId: "011357" })
    ).not.toThrow();
  });

  it("YYYYMMDD 검증", () => {
    expect(() =>
      getArticleChangeHistory.inputSchema.parse({
        lawId: "011357",
        fromRegDt: "2024-01-01",
      })
    ).toThrow();
    expect(() =>
      getArticleChangeHistory.inputSchema.parse({
        lawId: "011357",
        fromRegDt: "20240101",
      })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_article_change_history — 실 API", () => {
  it("PIPA 전체 조문 변경 이력 (10년 자동)", async () => {
    const client = new LawApiClient();
    const result = await getArticleChangeHistory.handler(
      getArticleChangeHistory.inputSchema.parse({ lawId: "011357" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보 보호법");
    expect(body).toContain("조문 변경 이력");
    expect(body).toMatch(/총 \d+개 시점/);
    expect(body).toMatch(/제\d+조/);
  }, 30_000);

  it("PIPA §15 조문 변경 이력 (jo 정규화 — '제15조' → '001500')", async () => {
    const client = new LawApiClient();
    const result = await getArticleChangeHistory.handler(
      getArticleChangeHistory.inputSchema.parse({
        lawId: "011357",
        jo: "제15조",
        fromRegDt: "20100101",
        toRegDt: "20251231",
      }),
      client
    );
    // jo 필터된 결과 또는 [NOT_FOUND] 둘 다 가능
    const body = result.content[0]?.text ?? "";
    if (!result.isError) {
      expect(body).toContain("제15조");
    } else {
      expect(body).toContain("[NOT_FOUND]");
    }
  }, 30_000);

  it("잘못된 lawId → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getArticleChangeHistory.handler(
      getArticleChangeHistory.inputSchema.parse({ lawId: "999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
