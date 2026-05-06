/**
 * 통합 시나리오 — 도구를 chain해서 실제 PIPA 도메인 작업을 수행.
 * suggestions의 args를 LLM이 그대로 다음 도구로 전달하는 시뮬레이션.
 *
 * 시나리오:
 *  S1. PIPA 검색 → 본문 → 위임 시행령
 *  S2. PIPA §15 조문 정밀 조회 → 비교
 *  S3. 약칭 검색 → 연혁 → 시점별 본문
 *  S4. 신구법 비교 → 변경 조문 추적
 *  S5. PIPA 의결례 검색 → 본문 → 인용 조문
 *  S6. 법령용어 검색 → 정의 → 사용 조문
 *  S7. PIPA 트리 navigation → 특정 절 조문
 *  S8. AI 의미검색 → 관련 법령 추천 → 본문
 */

import { describe, it, expect } from "vitest";
import { LawApiClient } from "../../src/client/law-api-client.js";
import { loadEnv } from "../../src/lib/env.js";
import { searchLaw } from "../../src/tools/primitives/search-law.js";
import { getLawText } from "../../src/tools/primitives/get-law-text.js";
import { getRelatedLaws } from "../../src/tools/primitives/get-related-laws.js";
import { getDelegatedLaws } from "../../src/tools/primitives/get-delegated-laws.js";
import { compareArticles } from "../../src/tools/primitives/compare-articles.js";
import { getLawHistory } from "../../src/tools/primitives/get-law-history.js";
import { getHistoricalLaw } from "../../src/tools/primitives/get-historical-law.js";
import { compareOldNew } from "../../src/tools/primitives/compare-old-new.js";
import { searchPipcDecisions } from "../../src/tools/primitives/search-pipc-decisions.js";
import { getPipcDecisionText } from "../../src/tools/primitives/get-pipc-decision-text.js";
import { getLegalTerm } from "../../src/tools/primitives/get-legal-term.js";
import { getTermArticles } from "../../src/tools/primitives/get-term-articles.js";
import { getLawTree } from "../../src/tools/primitives/get-law-tree.js";
import { intelligentLawSearch } from "../../src/tools/primitives/intelligent-law-search.js";
import { getIntelligentRelatedLaws } from "../../src/tools/primitives/get-intelligent-related-laws.js";
// W3 — Layer B+
import { getSectoralRelatedLaws } from "../../src/tools/hints/get-sectoral-related-laws.js";
import { getPipcCuratedCorpus } from "../../src/tools/hints/get-pipc-curated-corpus.js";
// W3 — Layer C corpus
import { searchPrivacyCorpus } from "../../src/tools/corpus/search-privacy-corpus.js";
import { searchPrivacyCases } from "../../src/tools/corpus/search-privacy-cases.js";
import { searchPrivacyGuides } from "../../src/tools/corpus/search-privacy-guides.js";
// W4 — Validator
import { verifyPipaCitation } from "../../src/tools/validator/verify-pipa-citation.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

/** 응답 텍스트에서 mst 추출 (`mst=N` 패턴) */
function extractMst(text: string): string | null {
  const m = text.match(/mst=(\d+)/);
  return m?.[1] ?? null;
}

/** 응답 텍스트에서 lawId 추출 (`lawId=N` 패턴) */
function extractLawId(text: string): string | null {
  const m = text.match(/lawId=(\d+)/);
  return m?.[1] ?? null;
}

/** 응답 텍스트에서 첫 [id=N] 추출 (의결례·해석례 본문 chain용) */
function extractFirstId(text: string): string | null {
  const m = text.match(/\[id=(\d+)\]/);
  return m?.[1] ?? null;
}

describe.skipIf(!hasApiKey)("S1. PIPA 검색 → 본문 → 위임 시행령", () => {
  const client = new LawApiClient();

  it("search_law → mst 발견 → get_law_text → get_delegated_laws", async () => {
    // 1단계: PIPA 검색
    const search = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개인정보 보호법" }),
      client
    );
    expect(search.isError).toBeFalsy();
    const mst = extractMst(search.content[0]?.text ?? "");
    const lawId = extractLawId(search.content[0]?.text ?? "");
    expect(mst).toBeTruthy();
    expect(lawId).toBeTruthy();

    // 2단계: 본문 조회 (mst 사용)
    const textResp = await getLawText.handler(
      getLawText.inputSchema.parse({ mst: mst! }),
      client
    );
    expect(textResp.isError).toBeFalsy();
    expect(textResp.content[0]?.text).toContain("개인정보 보호법");

    // 3단계: 위임 시행령 (lawId 사용)
    const delegated = await getDelegatedLaws.handler(
      getDelegatedLaws.inputSchema.parse({ lawId: lawId! }),
      client
    );
    expect(delegated.isError).toBeFalsy();
    expect(delegated.content[0]?.text).toMatch(/시행령|위임|조문/);
  }, 90_000);
});

describe.skipIf(!hasApiKey)("S2. PIPA §15 정밀 조회 → 비교", () => {
  const client = new LawApiClient();

  it("search_law → mst → compare_articles(§15 vs §17)", async () => {
    const search = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개인정보 보호법" }),
      client
    );
    const mst = extractMst(search.content[0]?.text ?? "");
    expect(mst).toBeTruthy();

    const compare = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: mst!, jo: "제15조" },
        right: { mst: mst!, jo: "제17조" },
      }),
      client
    );
    expect(compare.isError).toBeFalsy();
    const text = compare.content[0]?.text ?? "";
    expect(text).toContain("[제15조]");
    expect(text).toContain("[제17조]");
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S3. 약칭 → 연혁 → 시점별 본문", () => {
  const client = new LawApiClient();

  it("get_law_history('개보법') → 첫 mst → get_historical_law", async () => {
    // 약칭 정규화 적용 → PIPA 연혁
    const history = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "개보법" }),
      client
    );
    expect(history.isError).toBeFalsy();
    const mst = extractMst(history.content[0]?.text ?? "");
    expect(mst).toBeTruthy();

    // 시점별 본문
    const historical = await getHistoricalLaw.handler(
      getHistoricalLaw.inputSchema.parse({ mst: mst! }),
      client
    );
    expect(historical.isError).toBeFalsy();
    expect(historical.content[0]?.text).toContain("개인정보 보호법");
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S4. 신구법 비교 → 변경 조문 추적", () => {
  const client = new LawApiClient();

  it("search_law → mst → compare_old_new", async () => {
    const search = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개인정보 보호법" }),
      client
    );
    const mst = extractMst(search.content[0]?.text ?? "");
    expect(mst).toBeTruthy();

    const oldNew = await compareOldNew.handler(
      compareOldNew.inputSchema.parse({ mst: mst! }),
      client
    );
    expect(oldNew.isError).toBeFalsy();
    expect(oldNew.content[0]?.text).toContain("신구법 비교");
    // 변경 부분 markdown bold 강조
    expect(oldNew.content[0]?.text).toMatch(/\*\*[^*]+\*\*/);
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S5. PIPC 의결례 검색 → 본문", () => {
  const client = new LawApiClient();

  it("search_pipc_decisions → 첫 id → get_pipc_decision_text", async () => {
    const search = await searchPipcDecisions.handler(
      searchPipcDecisions.inputSchema.parse({ query: "개인정보" }),
      client
    );
    expect(search.isError).toBeFalsy();
    const id = extractFirstId(search.content[0]?.text ?? "");
    expect(id).toBeTruthy();

    const text = await getPipcDecisionText.handler(
      getPipcDecisionText.inputSchema.parse({ id: id! }),
      client
    );
    expect(text.isError).toBeFalsy();
    // 본문에 의결문 메타 (안건명·의결일 등) 포함
    expect(text.content[0]?.text).toMatch(/안건|의결|위반|결정/);
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S6. 법령용어 → 정의 → 사용 조문", () => {
  const client = new LawApiClient();

  it("get_legal_term('가명정보') → 정의 → get_term_articles로 사용 조문", async () => {
    const term = await getLegalTerm.handler(
      getLegalTerm.inputSchema.parse({ query: "가명정보", display: 3 }),
      client
    );
    expect(term.isError).toBeFalsy();
    expect(term.content[0]?.text).toContain("가명정보");

    const articles = await getTermArticles.handler(
      getTermArticles.inputSchema.parse({
        query: "가명정보",
        maxArticles: 5,
      }),
      client
    );
    expect(articles.isError).toBeFalsy();
    expect(articles.content[0]?.text).toContain("가명정보");
    expect(articles.content[0]?.text).toMatch(/lawId=\d+/);
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S7. PIPA 트리 navigation → 특정 조문 정밀 조회", () => {
  const client = new LawApiClient();

  it("get_law_tree → 트리에서 §15 식별 → compare_articles로 조문 fetch", async () => {
    const tree = await getLawTree.handler(
      getLawTree.inputSchema.parse({ mst: "270351" }),
      client
    );
    expect(tree.isError).toBeFalsy();
    const text = tree.content[0]?.text ?? "";
    // 트리에 제15조가 포함된 절 확인
    expect(text).toContain("제15조");
    expect(text).toContain("개인정보의 수집, 이용, 제공");

    // LLM이 트리 보고 §15 조회한다고 시뮬레이션
    const article = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제15조" },
        right: { mst: "270351", jo: "제15조" },
      }),
      client
    );
    expect(article.isError).toBeFalsy();
    expect(article.content[0]?.text).toContain("[제15조]");
    expect(article.content[0]?.text).toContain("개인정보의 수집");
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S8. AI 의미검색 → 연관 법령 → 본문", () => {
  const client = new LawApiClient();

  it("intelligent_law_search → 관련 조문 → mst → get_law_text", async () => {
    const ai = await intelligentLawSearch.handler(
      intelligentLawSearch.inputSchema.parse({
        query: "개인정보 동의 철회",
        display: 3,
      }),
      client
    );
    expect(ai.isError).toBeFalsy();
    const mst = extractMst(ai.content[0]?.text ?? "");
    if (mst) {
      const text = await getLawText.handler(
        getLawText.inputSchema.parse({ mst }),
        client
      );
      // 결과가 있다면 본문 정상 조회
      expect(text.content[0]?.text.length).toBeGreaterThan(100);
    }
  }, 60_000);

  it("get_intelligent_related_laws → 관련 조문 그룹", async () => {
    const related = await getIntelligentRelatedLaws.handler(
      getIntelligentRelatedLaws.inputSchema.parse({
        query: "개인정보",
        display: 5,
      }),
      client
    );
    expect(related.isError).toBeFalsy();
    expect(related.content[0]?.text).toContain("AI 연관법령");
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S9. 도메인 외 질의 처리 — Layer A 정상 동작", () => {
  const client = new LawApiClient();

  it("민법 검색 → 본문 (Layer A 게이트 X 검증)", async () => {
    const search = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "민법" }),
      client
    );
    expect(search.isError).toBeFalsy();
    const mst = extractMst(search.content[0]?.text ?? "");
    expect(mst).toBeTruthy();

    const text = await getLawText.handler(
      getLawText.inputSchema.parse({ mst: mst! }),
      client
    );
    expect(text.isError).toBeFalsy();
    expect(text.content[0]?.text).toContain("민법");
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S10. 교차 도메인 — 근로기준법 + 개인정보", () => {
  const client = new LawApiClient();

  it("intelligent_law_search('직원 개인정보') → 양쪽 도메인 매칭", async () => {
    const ai = await intelligentLawSearch.handler(
      intelligentLawSearch.inputSchema.parse({
        query: "직원 개인정보",
        display: 5,
      }),
      client
    );
    expect(ai.isError).toBeFalsy();
    // 근로 + 개인정보 양쪽 매칭이 의미검색으로 가능
    const text = ai.content[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(100);
  }, 60_000);
});

// ───────────────────────────────────────────────────
// W3·W4 신규 도구 통합 시나리오 (Layer B+ · Validator)
// ───────────────────────────────────────────────────

describe.skipIf(!hasApiKey)("S11. 분야 진입 → 법령 본문 chain", () => {
  const client = new LawApiClient();

  it("get_sectoral_related_laws(의료기관) → search_law(의료법) → mst → get_law_text", async () => {
    // 1단계: 분야별 PIPC 매핑 lookup
    const sec = await getSectoralRelatedLaws.handler(
      { sector: "의료기관", include_additional: true },
      client
    );
    expect(sec.isError).toBeFalsy();
    expect(sec.content[0]?.text).toContain("의료법");
    expect(sec.content[0]?.text).toContain("⚠ 면책");

    // 2단계: 매핑에서 발견한 의료법으로 정식 검색
    const sr = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "의료법" }),
      client
    );
    expect(sr.isError).toBeFalsy();
    const mst = extractMst(sr.content[0]?.text ?? "");
    expect(mst).toBeTruthy();

    // 3단계: 본문 직접 조회 — chain 자체 검증 (정확한 mst가 의료법이 아닐 수도 있음 — search_law 우선순위)
    const txt = await getLawText.handler(
      getLawText.inputSchema.parse({ mst: mst! }),
      client
    );
    expect(txt.isError).toBeFalsy();
    expect(txt.content[0]?.text.length).toBeGreaterThan(100);
  }, 90_000);
});

describe("S12. 도메인 출발점 → 분야별 lookup", () => {
  it("get_pipc_curated_corpus → get_sectoral_related_laws (chain)", async () => {
    const client = new LawApiClient({ apiKey: "unused-data-only" });
    // 1단계: PIPC 일반 도메인 12+23
    const corpus = await getPipcCuratedCorpus.handler({ category: "all" }, client);
    expect(corpus.isError).toBeFalsy();
    const ct = corpus.content[0]?.text ?? "";
    expect(ct).toContain("12개");
    expect(ct).toContain("23개");
    expect(ct).toContain("get_sectoral_related_laws"); // suggestion에 포함

    // 2단계: 분야별 lookup chain
    const sec = await getSectoralRelatedLaws.handler({}, client);
    expect(sec.isError).toBeFalsy();
    expect(sec.content[0]?.text).toContain("8개 분야");
  });
});

describe.skipIf(!hasApiKey)("S13. 분야 미수록 → 자율 검색 유도", () => {
  const client = new LawApiClient();

  it("get_sectoral_related_laws('건설') → [NOT_FOUND_SCOPE] → search_law fallback", async () => {
    // 1단계: 미수록 분야
    const sec = await getSectoralRelatedLaws.handler({ sector: "건설" }, client);
    const secText = sec.content[0]?.text ?? "";
    expect(secText).toContain("[NOT_FOUND_SCOPE]");
    expect(secText).toContain("search_law");

    // 2단계: 안내된 search_law로 fallback
    const sr = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "건설근로자" }),
      client
    );
    expect(sr.isError).toBeFalsy();
    expect(sr.content[0]?.text).toContain("건설근로자");
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S14. 환각 검증 — 정상 인용", () => {
  const client = new LawApiClient();

  it("verify_pipa_citation('PIPA §15 ① 6호') → ✅ 4계층 모두 ✓", async () => {
    const v = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "PIPA §15 ① 6호" }),
      client
    );
    expect(v.isError).toBeFalsy();
    const text = v.content[0]?.text ?? "";
    expect(text).toContain("✅ 인용 검증 성공");
    expect(text).toContain("법령 존재");
    expect(text).toContain("조문 존재");
    expect(text).toContain("제1항 존재");
    expect(text).toContain("제6호 존재");
    expect(text).toContain("📎 출처:");
  }, 30_000);
});

describe.skipIf(!hasApiKey)("S15. 환각 검증 — 인용 오류 발견", () => {
  const client = new LawApiClient();

  it("verify_pipa_citation('PIPA §9999') → [HALLUCINATION_DETECTED] + 다음 도구 안내", async () => {
    const v = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "PIPA §9999" }),
      client
    );
    expect(v.isError).toBe(true);
    const text = v.content[0]?.text ?? "";
    expect(text).toContain("[HALLUCINATION_DETECTED]");
    expect(text).toContain("조문 없음");
    // 조문 없을 때는 get_law_text(전체 본문) 권유 (tree는 article 있을 때만)
    expect(text).toContain("get_law_text");
  }, 30_000);
});

describe.skipIf(!hasApiKey)("S16. 의료 분야 정밀 검토 (Layer B+ + 코퍼스 + Validator)", () => {
  const client = new LawApiClient();

  it("의료분야 매핑 → 코퍼스 사례 → 인용 검증 풀 chain", async () => {
    // 1단계: 의료분야 PIPC 매핑
    const sec = await getSectoralRelatedLaws.handler(
      { sector: "의료기관" },
      client
    );
    expect(sec.isError).toBeFalsy();

    // 2단계: 의료 분야 상담사례
    const cases = await searchPrivacyCases.handler(
      searchPrivacyCases.inputSchema.parse({
        query: "환자 동의",
        category3: "보건·의료",
        display: 3,
      }),
      client
    );
    expect(cases.isError).toBeFalsy();
    expect(cases.content[0]?.text).toContain("보건·의료");

    // 3단계: PIPA §15 인용 검증 (사례에서 자주 인용)
    const v = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "PIPA §15" }),
      client
    );
    expect(v.isError).toBeFalsy();
    expect(v.content[0]?.text).toContain("✅");
  }, 60_000);
});

describe.skipIf(!hasApiKey)("S17. 별칭 정규화 일관성 (3개 도구 cross-tool)", () => {
  const client = new LawApiClient();

  it("'개보법' (search_law·verify·get_law_history 모두 PIPA 정식명으로 변환)", async () => {
    // search_law
    const sr = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개보법" }),
      client
    );
    expect(sr.isError).toBeFalsy();
    expect(sr.content[0]?.text).toContain("개인정보 보호법");

    // verify_pipa_citation
    const v = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "개보법 제15조" }),
      client
    );
    expect(v.isError).toBeFalsy();
    expect(v.content[0]?.text).toContain("개인정보 보호법");

    // get_law_history
    const h = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "개보법" }),
      client
    );
    expect(h.isError).toBeFalsy();
    expect(h.content[0]?.text).toContain("개인정보 보호법");
  }, 90_000);
});

describe("S18. 도구 description ListTools 토큰 측정 (W5 목표 < 10KB)", () => {
  it("36개 도구 description 합산 < 30,000자 (현실적 목표)", async () => {
    const { ALL_TOOLS } = await import("../../src/tools/registry.js");
    const total = ALL_TOOLS.reduce((sum, t) => sum + t.description.length, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(30_000);
    // 정보용 — 실제 측정 (KB 추정: 한국어 평균 1자=2바이트)
    const kbEstimate = (total * 2) / 1024;
    console.log(
      `  [info] description 총 ${total}자, ~${kbEstimate.toFixed(1)}KB (UTF-8 추정)`
    );
  });
});
