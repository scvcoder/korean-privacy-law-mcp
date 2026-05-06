import { describe, it, expect, beforeEach } from "vitest";
import {
  getLawAbbreviations,
  __resetAbbrevCache,
} from "../../../src/tools/primitives/get-law-abbreviations.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_law_abbreviations — 정의", () => {
  it("name·description", () => {
    expect(getLawAbbreviations.name).toBe("get_law_abbreviations");
    expect(getLawAbbreviations.description).toContain("약칭");
    expect(getLawAbbreviations.description).toContain("lsAbrv");
  });

  it("입력 스키마 — 모든 필드 옵셔널, 기본값 적용", () => {
    const parsed = getLawAbbreviations.inputSchema.parse({});
    expect(parsed.exact).toBe(false);
    expect(parsed.display).toBe(20);
    expect(parsed.bypassCache).toBe(false);
  });

  it("stdDt 8자리 검증", () => {
    expect(() =>
      getLawAbbreviations.inputSchema.parse({ stdDt: "2025-01-01" })
    ).toThrow();
    expect(() =>
      getLawAbbreviations.inputSchema.parse({ stdDt: "20250101" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_law_abbreviations — 실 API", () => {
  beforeEach(() => {
    __resetAbbrevCache();
  });

  it("'정보통신망법' → 정식명 매칭", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "정보통신망법", display: 5 }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("정보통신망");
    expect(body).toContain("정보통신망법");
    expect(body).toMatch(/mst=\d+/);
    expect(body).toMatch(/lawId=\d+/);
  }, 60_000);

  it("'개인정보' 부분 매칭 → 다수 결과", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({
        query: "개인정보",
        display: 3,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보");
    expect(body).toMatch(/매칭/);
  }, 60_000);

  it("두 번째 호출은 캐시 사용", async () => {
    const client = new LawApiClient();
    // 1회차 — 캐시 적재
    await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "정보통신망법" }),
      client
    );
    // 2회차 — 캐시에서
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "정보통신망법" }),
      client
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("캐시 사용");
  }, 90_000);

  it("bypassCache=true → 캐시 무시", async () => {
    const client = new LawApiClient();
    // 1회차 — 캐시 적재
    await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "정보통신망법" }),
      client
    );
    // 2회차 — bypassCache
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({
        query: "정보통신망법",
        bypassCache: true,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).not.toContain("캐시 사용");
  }, 90_000);

  it("매칭 없는 query → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({
        query: "xyzqwerexistencequery123nonsense",
      }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 60_000);

  it("query 미지정 → 등록 순 N건 덤프", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ display: 3 }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toMatch(/전체 \d+건/);
    expect(body).toContain("[1]");
    expect(body).toContain("[3]");
  }, 60_000);

  it("약칭 필드 정확 매칭 — '정보통신망법'은 약칭으로 등록됨", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({
        query: "정보통신망법",
        exact: true,
        display: 5,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    // exact=true에서도 매칭됨 → 약칭 필드가 정확히 "정보통신망법"
    expect(body).toContain("약칭: 정보통신망법");
    expect(body).toContain("정보통신망 이용촉진 및 정보보호");
  }, 60_000);

  it("비공식 약칭 '정통망법' → PRIVACY_ALIASES 자동 변환 후 매칭", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "정통망법" }),
      client
    );
    // '정통망법' → '정보통신망 이용촉진 및 정보보호 등에 관한 법률' 변환 후 lsAbrv 매칭 성공
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("도메인 약칭 변환");
    expect(body).toContain("정보통신망 이용촉진 및 정보보호");
  }, 60_000);

  it("'개보법' → 변환 후에도 PIPA 약칭 미등록 → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "개보법" }),
      client
    );
    // '개보법' → '개인정보 보호법' 변환되지만 PIPA 자체가 lsAbrv 미수록 → [NOT_FOUND]
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("[NOT_FOUND]");
    expect(text).toContain("도메인 약칭 변환"); // 변환은 되었으나 lsAbrv에 없음을 명시
  }, 60_000);

  it("PRIVACY_ALIASES에 없는 비공식 표현 → 변환 없이 [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({
        query: "xyzqwerexistencequery123nonsense",
      }),
      client
    );
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("[NOT_FOUND]");
    expect(text).not.toContain("도메인 약칭 변환");
  }, 60_000);

  it("exact=true → 부분 매칭 차단", async () => {
    const client = new LawApiClient();
    // "정보통신망"만 으로는 정확 매칭 없음 (등록된 약칭은 "정보통신망법")
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({
        query: "정보통신망",
        exact: true,
      }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 60_000);

  it("도메인 한계 검증 — PIPA 정식명 자체는 lsAbrv 미등록", async () => {
    const client = new LawApiClient();
    // 「개인정보 보호법」 자체가 lsAbrv 사전에 없음 (약칭 미등록 법령은 미포함)
    // → PIPA 도메인은 lsAbrv 거의 못 커버 → aliases_privacy.json 보완 필요성 입증
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({
        query: "개인정보 보호법",
        exact: true,
      }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 60_000);

  it("부분 매칭 — '개인정보' 키워드는 광범위 매칭 (개인정보 약칭 등록 법령)", async () => {
    const client = new LawApiClient();
    const result = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({
        query: "개인정보",
        display: 10,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    // 개인정보 관련 약칭은 매우 적음 ('경찰개인정보처리규정' 등) — 매칭 건수 검증
    expect(body).toMatch(/매칭/);
    expect(body).toContain("개인정보");
  }, 60_000);
});
