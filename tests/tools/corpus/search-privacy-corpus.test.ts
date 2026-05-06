import { describe, it, expect } from "vitest";
import { searchPrivacyCorpus } from "../../../src/tools/corpus/search-privacy-corpus.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";

const client = new LawApiClient({ apiKey: "unused-corpus-only" });

describe("search_privacy_corpus — 정의", () => {
  it("name·description", () => {
    expect(searchPrivacyCorpus.name).toBe("search_privacy_corpus");
    expect(searchPrivacyCorpus.description).toContain("PIPC");
    expect(searchPrivacyCorpus.description).toContain("2,202");
  });

  it("스키마 — query 필수, source_type 기본 'all'", () => {
    expect(() => searchPrivacyCorpus.inputSchema.parse({})).toThrow();
    const parsed = searchPrivacyCorpus.inputSchema.parse({ query: "x" });
    expect(parsed.source_type).toBe("all");
    expect(parsed.display).toBe(5);
  });

  it("source_type enum 검증", () => {
    expect(() =>
      searchPrivacyCorpus.inputSchema.parse({ query: "x", source_type: "invalid" })
    ).toThrow();
    expect(() =>
      searchPrivacyCorpus.inputSchema.parse({ query: "x", source_type: "guide" })
    ).not.toThrow();
  });
});

describe("search_privacy_corpus — 검색 동작 (BM25 인덱스)", () => {
  it("'의료기관 환자 동의' → 보건·의료 사례 매칭", async () => {
    const r = await searchPrivacyCorpus.handler(
      searchPrivacyCorpus.inputSchema.parse({
        query: "의료기관 환자 동의",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("PIPC 코퍼스 검색");
    expect(text).toMatch(/💬 상담사례|📘 가이드/);
    expect(text).toContain("📎 출처: 개인정보보호위원회");
  }, 15_000);

  it("source_type=guide로 사례 제외", async () => {
    const r = await searchPrivacyCorpus.handler(
      searchPrivacyCorpus.inputSchema.parse({
        query: "CCTV 화각",
        source_type: "guide",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).not.toContain("💬 상담사례");
    expect(text).toContain("📘 가이드");
  }, 15_000);

  it("source_type=case로 가이드 제외", async () => {
    const r = await searchPrivacyCorpus.handler(
      searchPrivacyCorpus.inputSchema.parse({
        query: "회원가입",
        source_type: "case",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).not.toContain("📘 가이드");
    expect(text).toContain("💬 상담사례");
  }, 15_000);

  it("매칭 0건 → [NOT_FOUND_SCOPE] (Layer C 도메인 외)", async () => {
    const r = await searchPrivacyCorpus.handler(
      searchPrivacyCorpus.inputSchema.parse({
        query: "zzqwerxy123nonsensetoken987",
      }),
      client
    );
    expect(r.content[0]?.text).toContain("[NOT_FOUND_SCOPE]");
  }, 15_000);

  it("이어서 할 수 있는 조회 anchoring 포함", async () => {
    const r = await searchPrivacyCorpus.handler(
      searchPrivacyCorpus.inputSchema.parse({
        query: "가명정보 결합",
        display: 3,
      }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("이어서 할 수 있는 조회");
    expect(text).toContain("search_law");
  }, 15_000);
});
