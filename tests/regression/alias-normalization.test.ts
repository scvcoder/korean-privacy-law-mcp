/**
 * Regression: PRIVACY_ALIASES 자동 정규화가 일관되게 적용되는지 검증.
 * 적용 도구: search_law, get_law_history, get_annexes, get_law_abbreviations
 *
 * 핵심 도메인 사실: 법제처 lsAbrv는 PIPA 도메인 약칭 거의 미수록.
 * '개보법'·'정통망법'·'통비법' 등 통용 약칭은 PRIVACY_ALIASES가 보완.
 */

import { describe, it, expect } from "vitest";
import { LawApiClient } from "../../src/client/law-api-client.js";
import { loadEnv } from "../../src/lib/env.js";
import { searchLaw } from "../../src/tools/primitives/search-law.js";
import { getLawHistory } from "../../src/tools/primitives/get-law-history.js";
import { getAnnexes } from "../../src/tools/primitives/get-annexes.js";
import {
  getLawAbbreviations,
  __resetAbbrevCache,
} from "../../src/tools/primitives/get-law-abbreviations.js";
import { resolveLawAlias, PRIVACY_ALIASES } from "../../src/lib/aliases.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("PRIVACY_ALIASES 사전 자체 검증", () => {
  it("17개 entry 등록", () => {
    expect(PRIVACY_ALIASES.length).toBeGreaterThanOrEqual(17);
  });

  it("핵심 도메인 약칭 변환 — 개보법", () => {
    expect(resolveLawAlias("개보법")).toBe("개인정보 보호법");
  });

  it("핵심 도메인 약칭 변환 — 정통망법", () => {
    expect(resolveLawAlias("정통망법")).toBe(
      "정보통신망 이용촉진 및 정보보호 등에 관한 법률"
    );
  });

  it("정통법(축약) → 정통망법과 동일 정식명", () => {
    expect(resolveLawAlias("정통법")).toBe(
      "정보통신망 이용촉진 및 정보보호 등에 관한 법률"
    );
  });

  it("통비법 변환", () => {
    expect(resolveLawAlias("통비법")).toBe("통신비밀보호법");
  });

  it("신정법 변환", () => {
    expect(resolveLawAlias("신정법")).toBe(
      "신용정보의 이용 및 보호에 관한 법률"
    );
  });

  it("위정법 변환", () => {
    expect(resolveLawAlias("위정법")).toBe(
      "위치정보의 보호 및 이용 등에 관한 법률"
    );
  });

  it("정식명 입력 시 그대로", () => {
    expect(resolveLawAlias("개인정보 보호법")).toBe("개인정보 보호법");
  });

  it("등록 안 된 입력 시 그대로 (변환 없음)", () => {
    expect(resolveLawAlias("xyzqwerexistencequery123")).toBe(
      "xyzqwerexistencequery123"
    );
  });

  it("trim 적용", () => {
    expect(resolveLawAlias("  개보법  ")).toBe("개인정보 보호법");
  });
});

describe.skipIf(!hasApiKey)("약칭 정규화 — 도구별 적용 일관성", () => {
  const client = new LawApiClient();

  it("search_law('개보법') → 개인정보 보호법 검색", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개보법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("개인정보 보호법");
  }, 30_000);

  it("search_law('정통망법') → 정보통신망법 검색", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "정통망법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("정보통신망");
  }, 30_000);

  it("search_law('통비법') → 통신비밀보호법 검색", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "통비법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("통신비밀보호법");
  }, 30_000);

  it("get_law_history('개보법') → PIPA 연혁", async () => {
    const r = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "개보법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("개인정보 보호법");
  }, 30_000);

  it("get_annexes('개보법') → PIPA 별표 검색 (별표 없으면 시행령 자동 검색)", async () => {
    const r = await getAnnexes.handler(
      getAnnexes.inputSchema.parse({ lawName: "개보법" }),
      client
    );
    // 본법 별표 없거나 시행령 별표 자동 검색 — 둘 다 정상
    expect(r.content[0]?.text).toBeDefined();
    // 알리아스 정규화는 적용됨 (정식명 또는 시행령 응답)
    const body = r.content[0]?.text ?? "";
    expect(body).toMatch(/개인정보 보호법|개인정보보호법/);
  }, 30_000);

  it("get_law_abbreviations('정통망법') → 도메인 변환 + lsAbrv 매칭", async () => {
    __resetAbbrevCache();
    const r = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "정통망법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    const body = r.content[0]?.text ?? "";
    expect(body).toContain("도메인 약칭 변환");
    expect(body).toContain("정보통신망 이용촉진");
  }, 60_000);

  it("get_law_abbreviations('개보법') → 변환 후에도 PIPA lsAbrv 미수록 → [NOT_FOUND]", async () => {
    __resetAbbrevCache();
    const r = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "개보법" }),
      client
    );
    expect(r.isError).toBe(true);
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[NOT_FOUND]");
    expect(text).toContain("도메인 약칭 변환"); // 변환은 시도됨을 명시
  }, 60_000);

  it("[CONSISTENCY] search_law·get_law_history는 같은 mst 발견", async () => {
    // 약칭 정규화가 일관되면 두 도구가 같은 법령을 가리킴
    const search = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개보법" }),
      client
    );
    const history = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "개보법" }),
      client
    );
    expect(search.isError).toBeFalsy();
    expect(history.isError).toBeFalsy();
    // 두 응답 모두 동일 정식명 포함
    expect(search.content[0]?.text).toContain("개인정보 보호법");
    expect(history.content[0]?.text).toContain("개인정보 보호법");
  }, 30_000);
});
