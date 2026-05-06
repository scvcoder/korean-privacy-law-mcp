import { describe, it, expect } from "vitest";
import { getEnglishLawText } from "../../../src/tools/primitives/get-english-law-text.js";
import { searchEnglishLaw } from "../../../src/tools/primitives/search-english-law.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_english_law_text — 정의", () => {
  it("name·description", () => {
    expect(getEnglishLawText.name).toBe("get_english_law_text");
    expect(getEnglishLawText.description).toContain("영문");
    expect(getEnglishLawText.description).toContain("Article");
  });

  it("입력 스키마 — mst 필수", () => {
    expect(() => getEnglishLawText.inputSchema.parse({})).toThrow();
    expect(() =>
      getEnglishLawText.inputSchema.parse({ mst: "270351" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_english_law_text — 실 API", () => {
  it("PIPA 영문본 (mst=270351) → Article 구조 추출", async () => {
    const client = new LawApiClient();
    const result = await getEnglishLawText.handler(
      getEnglishLawText.inputSchema.parse({ mst: "270351" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("PERSONAL INFORMATION PROTECTION ACT");
    expect(body).toContain("Law ID:");
    expect(body).toMatch(/\[Article \d+\]/);
    expect(body).toContain("Source:");
  }, 60_000);

  it("search_english_law → mst → 본문 (chain)", async () => {
    const client = new LawApiClient();

    const search = await searchEnglishLaw.handler(
      searchEnglishLaw.inputSchema.parse({
        query: "Personal Information Protection",
        display: 3,
      }),
      client
    );
    expect(search.isError).toBeFalsy();
    const text = search.content[0]?.text ?? "";
    const mstMatch = text.match(/mst=(\d+)/);
    expect(mstMatch).toBeTruthy();
    const mst = mstMatch![1]!;

    const result = await getEnglishLawText.handler(
      getEnglishLawText.inputSchema.parse({ mst }),
      client
    );
    expect(result.isError).toBeFalsy();
  }, 60_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getEnglishLawText.handler(
      getEnglishLawText.inputSchema.parse({ mst: "999999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
