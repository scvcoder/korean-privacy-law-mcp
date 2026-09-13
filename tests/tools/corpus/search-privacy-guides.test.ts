import { describe, it, expect } from "vitest";
import { searchPrivacyGuides } from "../../../src/tools/corpus/search-privacy-guides.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";

const client = new LawApiClient({ apiKey: "unused-corpus-only" });

describe("search_privacy_guides — 정의", () => {
  it("name·description", () => {
    expect(searchPrivacyGuides.name).toBe("search_privacy_guides");
    expect(searchPrivacyGuides.description).toContain("7종");
    expect(searchPrivacyGuides.description).toContain("pseudonym");
    expect(searchPrivacyGuides.description).toContain("sectoral");
  });

  it("스키마 — query 필수, doc_type 기본 'all'", () => {
    expect(() => searchPrivacyGuides.inputSchema.parse({})).toThrow();
    const parsed = searchPrivacyGuides.inputSchema.parse({ query: "x" });
    expect(parsed.doc_type).toBe("all");
    expect(parsed.display).toBe(5);
  });

  it("doc_type enum — 8개 값 (qa/small_business/cctv/sectoral/pseudonym/privacy_policy/public_ax/all)", () => {
    for (const t of [
      "qa",
      "small_business",
      "cctv",
      "sectoral",
      "pseudonym",
      "privacy_policy",
      "public_ax",
      "all",
    ]) {
      expect(() =>
        searchPrivacyGuides.inputSchema.parse({ query: "x", doc_type: t })
      ).not.toThrow();
    }
    expect(() =>
      searchPrivacyGuides.inputSchema.parse({ query: "x", doc_type: "invalid" })
    ).toThrow();
  });
});

describe("search_privacy_guides — doc_type 필터", () => {
  it("doc_type=cctv → CCTV 안내서만", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "영상정보",
        doc_type: "cctv",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[cctv]");
    // 모든 결과가 CCTV 안내서
    expect(text).toContain("고정형 영상정보처리기기");
  }, 15_000);

  it("doc_type=sectoral → 분야별 안내서만 (8개 편 전체 476청크)", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "의료기관",
        doc_type: "sectoral",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[sectoral]");
    expect(text).toContain("분야별 개인정보 보호 안내서");
  }, 15_000);

  it("doc_type=qa → 질의응답 모음집만", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "개인정보 해당",
        doc_type: "qa",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[qa]");
    expect(text).toContain("질의응답");
  }, 15_000);

  it("doc_type=small_business → 소상공인 핸드북만", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "소상공인",
        doc_type: "small_business",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[small_business]");
    expect(text).toContain("소상공인");
  }, 15_000);

  it("doc_type=pseudonym → 가명정보 처리 가이드라인만 (본권+별권 132청크)", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "결합전문기관 반출심사",
        doc_type: "pseudonym",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[pseudonym]");
    expect(text).toContain("가명정보 처리 가이드라인");
  }, 15_000);

  it("doc_type=privacy_policy → 처리방침 작성지침만", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "국외 이전 처리방침 기재",
        doc_type: "privacy_policy",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[privacy_policy]");
    expect(text).toContain("개인정보 처리방침 작성지침");
  }, 15_000);

  it("doc_type=public_ax → 공공 AX 안내서만", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "사전적정성 검토 적법근거",
        doc_type: "public_ax",
        display: 3,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[public_ax]");
    expect(text).toContain("공공 AX 프라이버시 보호 안내서");
  }, 15_000);

  it("doc_type=all → 7종 모두 검색 가능", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "개인정보",
        doc_type: "all",
        display: 10,
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    // [all]은 응답에 표시 안 됨 (필터 없음)
    expect(text).not.toContain("[all]");
  }, 15_000);

  it("PIPC attribution + 페이지 표시", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "개인정보",
        display: 3,
      }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("📎 출처: 개인정보보호위원회");
  }, 15_000);

  it("매칭 0건 → [NOT_FOUND_SCOPE]", async () => {
    const r = await searchPrivacyGuides.handler(
      searchPrivacyGuides.inputSchema.parse({
        query: "zzqwerxy123nonsensetoken987",
      }),
      client
    );
    expect(r.content[0]?.text).toContain("[NOT_FOUND_SCOPE]");
  }, 15_000);
});
