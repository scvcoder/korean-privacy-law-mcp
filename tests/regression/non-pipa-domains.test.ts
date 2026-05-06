/**
 * Regression: Layer A primitive는 PIPA 외 일반 법령 도메인에서도 정상 동작해야 함.
 * CLAUDE.md 도메인 외 질의 처리 정책: "Layer A — Primitives | 정상 작동 (전체 법령 조회 가능)".
 * 이 회귀는 우리가 무심코 PIPA 게이트를 추가하지 않았는지 확인.
 */

import { describe, it, expect } from "vitest";
import { LawApiClient } from "../../src/client/law-api-client.js";
import { loadEnv } from "../../src/lib/env.js";
import { searchLaw } from "../../src/tools/primitives/search-law.js";
import { intelligentLawSearch } from "../../src/tools/primitives/intelligent-law-search.js";
import { searchAdminAppeals } from "../../src/tools/primitives/search-admin-appeals.js";
import { searchInterpretations } from "../../src/tools/primitives/search-interpretations.js";
import { searchConstitutionalDecisions } from "../../src/tools/primitives/search-constitutional-decisions.js";
import { searchAdminRule } from "../../src/tools/primitives/search-admin-rule.js";
import { getLawAbbreviations } from "../../src/tools/primitives/get-law-abbreviations.js";
import { getIntelligentRelatedLaws } from "../../src/tools/primitives/get-intelligent-related-laws.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe.skipIf(!hasApiKey)("비PIPA 도메인 — Layer A 게이트 없음 검증", () => {
  const client = new LawApiClient();

  it("search_law: 민법 검색 정상 결과", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "민법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("민법");
  }, 30_000);

  it("search_law: 상법 검색 정상 결과 (display=100 quirk 적용)", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "상법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("상법");
  }, 30_000);

  it("search_law: 근로기준법 검색 정상 결과", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "근로기준법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("근로기준법");
  }, 30_000);

  it("search_law: 형법 검색 정상 결과", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "형법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("형법");
  }, 30_000);

  it("intelligent_law_search: 비PIPA 키워드 ('계약 청약')", async () => {
    const r = await intelligentLawSearch.handler(
      intelligentLawSearch.inputSchema.parse({ query: "계약 청약", display: 5 }),
      client
    );
    expect(r.isError).toBeFalsy();
    const body = r.content[0]?.text ?? "";
    // 의미검색은 PIPA 외 도메인이라도 매칭 결과 나와야 정상
    expect(body.length).toBeGreaterThan(50);
  }, 30_000);

  it("search_admin_appeals: 비개인정보 키워드 ('건축허가')", async () => {
    const r = await searchAdminAppeals.handler(
      searchAdminAppeals.inputSchema.parse({ query: "건축허가" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toMatch(/총 \d+건/);
  }, 30_000);

  it("search_interpretations: 비PIPA 키워드 ('연장근로')", async () => {
    const r = await searchInterpretations.handler(
      searchInterpretations.inputSchema.parse({ query: "연장근로" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toMatch(/총 \d+건/);
  }, 30_000);

  it("search_constitutional_decisions: 비PIPA 키워드 ('표현')", async () => {
    const r = await searchConstitutionalDecisions.handler(
      searchConstitutionalDecisions.inputSchema.parse({ query: "표현" }),
      client
    );
    // 게이트 없음 검증이 목적 — 매칭 있으면 통과, 없으면 [NOT_FOUND] 정상 처리
    const body = r.content[0]?.text ?? "";
    if (r.isError) {
      expect(body).toContain("[NOT_FOUND]");
    } else {
      expect(body).toMatch(/총 \d+건/);
    }
  }, 30_000);

  it("search_admin_rule: 비PIPA 키워드 ('국세청 고시')", async () => {
    const r = await searchAdminRule.handler(
      searchAdminRule.inputSchema.parse({ query: "국세청" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toMatch(/총 \d+건/);
  }, 30_000);

  it("get_intelligent_related_laws: 비PIPA 키워드 ('근로계약')", async () => {
    const r = await getIntelligentRelatedLaws.handler(
      getIntelligentRelatedLaws.inputSchema.parse({
        query: "근로계약",
        display: 5,
      }),
      client
    );
    // 매칭 있으면 정상, 없어도 게이트 X로 NOT_FOUND만 정상 처리
    const body = r.content[0]?.text ?? "";
    if (r.isError) {
      expect(body).toContain("[NOT_FOUND]");
    } else {
      expect(body).toMatch(/총 \d+건/);
    }
  }, 30_000);

  it("get_law_abbreviations: 비PIPA 도메인 약칭 ('상법')", async () => {
    const r = await getLawAbbreviations.handler(
      getLawAbbreviations.inputSchema.parse({ query: "상법", display: 5 }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("상법");
  }, 60_000);
});
