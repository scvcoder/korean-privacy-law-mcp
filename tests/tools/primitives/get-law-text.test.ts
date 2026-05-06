import { describe, it, expect } from "vitest";
import { getLawText } from "../../../src/tools/primitives/get-law-text.js";
import { searchLaw } from "../../../src/tools/primitives/search-law.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_law_text — 도구 정의", () => {
  it("name·description·schema 정의됨", () => {
    expect(getLawText.name).toBe("get_law_text");
    expect(getLawText.description).toContain("본문 조회");
  });

  it("입력 스키마 — mst 또는 lawId 필수", () => {
    expect(() => getLawText.inputSchema.parse({})).toThrow();
    expect(() =>
      getLawText.inputSchema.parse({ mst: "12345" })
    ).not.toThrow();
    expect(() =>
      getLawText.inputSchema.parse({ lawId: "12345" })
    ).not.toThrow();
  });

  it("입력 스키마 — efYd YYYYMMDD 검증", () => {
    expect(() =>
      getLawText.inputSchema.parse({ mst: "1", efYd: "2024-01-01" })
    ).toThrow();
    expect(() =>
      getLawText.inputSchema.parse({ mst: "1", efYd: "20240101" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_law_text — 실 API", () => {
  it("'개인정보 보호법' search → mst → 본문 조회", async () => {
    const client = new LawApiClient();

    // 먼저 search로 mst 획득
    const search = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개인정보 보호법" }),
      client
    );
    expect(search.isError).toBeFalsy();
    const text = search.content[0]?.text ?? "";
    const match = text.match(/mst=(\d+)/);
    expect(match).toBeTruthy();
    const mst = match![1]!;

    // 본문 조회
    const result = await getLawText.handler(
      getLawText.inputSchema.parse({ mst }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보");
    expect(body).toMatch(/\[제\d+조/);
    expect(body).toContain("이어서 할 수 있는 조회");
  }, 60_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getLawText.handler(
      getLawText.inputSchema.parse({ mst: "999999999" }),
      client
    );
    // API가 빈 본문 또는 에러 반환 — 둘 다 우리는 [NOT_FOUND]로 처리
    expect(result.isError).toBe(true);
  }, 30_000);
});
