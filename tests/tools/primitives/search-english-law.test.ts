import { describe, it, expect } from "vitest";
import { searchEnglishLaw } from "../../../src/tools/primitives/search-english-law.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("search_english_law — 정의", () => {
  it("name·description", () => {
    expect(searchEnglishLaw.name).toBe("search_english_law");
    expect(searchEnglishLaw.description).toContain("영문");
    expect(searchEnglishLaw.description).toContain("GDPR");
  });

  it("입력 스키마 — query 필수, display 기본 50", () => {
    const parsed = searchEnglishLaw.inputSchema.parse({ query: "Privacy" });
    expect(parsed.display).toBe(50);
  });
});

describe.skipIf(!hasApiKey)("search_english_law — 실 API", () => {
  it("'Personal Information Protection' → PIPA 영문본 매칭, HTML strip", async () => {
    const client = new LawApiClient();
    const result = await searchEnglishLaw.handler(
      searchEnglishLaw.inputSchema.parse({
        query: "Personal Information Protection",
        display: 3,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("영문 법령");
    expect(text).toContain("개인정보 보호법");
    // HTML strip 검증 — <strong> 태그가 응답에 노출되면 안 됨
    expect(text).not.toContain("<strong");
    expect(text).not.toContain("</strong>");
    // 영문명이 포함됨
    expect(text.toLowerCase()).toContain("personal");
  }, 30_000);
});
