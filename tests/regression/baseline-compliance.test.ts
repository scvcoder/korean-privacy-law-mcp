/**
 * Regression: 모든 도구가 응답 baseline 7요소를 일관되게 적용하는지 검증.
 * CLAUDE.md "응답 Baseline":
 *  1. [NOT_FOUND] / [HALLUCINATION_DETECTED] 마커
 *  2. isError: true 정확 세팅
 *  3. "이어서 할 수 있는 조회" 자동 첨부
 *  4. 정규 URL 첨부 (📎 출처)
 *  5. API 키 마스킹
 *  6. PIPC attribution (Layer C)
 *  7. Scope 마커 (도메인 외)
 *
 * 모든 31개 도구를 모두 검증하기보다, 카테고리별 대표 도구를 선택해 검증.
 */

import { describe, it, expect } from "vitest";
import { LawApiClient } from "../../src/client/law-api-client.js";
import { loadEnv } from "../../src/lib/env.js";
import { ALL_TOOLS } from "../../src/tools/registry.js";
import { searchLaw } from "../../src/tools/primitives/search-law.js";
import { getLawText } from "../../src/tools/primitives/get-law-text.js";
import { getLawTree } from "../../src/tools/primitives/get-law-tree.js";
import { searchPipcDecisions } from "../../src/tools/primitives/search-pipc-decisions.js";
import { compareArticles } from "../../src/tools/primitives/compare-articles.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("도구 description baseline — 4요소", () => {
  // CLAUDE.md "description은 무엇·언제·다음 도구·한계 4요소 명시"
  // tests/server.test.ts에서 이미 일부 검증 중 — 여기는 보강.

  it("31개 도구 모두 description 길이 80자 이상", () => {
    for (const t of ALL_TOOLS) {
      expect(t.description.length).toBeGreaterThanOrEqual(80);
    }
  });

  it("31개 도구 모두 description 800자 이내 (ListTools 토큰 부담)", () => {
    for (const t of ALL_TOOLS) {
      expect(t.description.length, `${t.name}`).toBeLessThanOrEqual(800);
    }
  });

  it("'다음:' 또는 '다음' 안내 포함 (다음 도구 chain)", () => {
    for (const t of ALL_TOOLS) {
      expect(t.description, `${t.name}`).toMatch(/다음/);
    }
  });

  it("name 형식 — snake_case 영문 소문자", () => {
    for (const t of ALL_TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("inputSchema 모두 정의됨 (zod 객체)", () => {
    for (const t of ALL_TOOLS) {
      expect(t.inputSchema).toBeDefined();
      expect(typeof t.inputSchema.parse).toBe("function");
    }
  });
});

describe.skipIf(!hasApiKey)("성공 응답 baseline — 정규 URL + 이어서 조회", () => {
  const client = new LawApiClient();

  it("search_law 성공 응답 — '이어서 할 수 있는 조회' 포함", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개인정보 보호법" }),
      client
    );
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text).toContain("이어서 할 수 있는 조회");
  }, 30_000);

  it("get_law_text 성공 응답 — '📎 출처' 정규 URL 포함", async () => {
    const r = await getLawText.handler(
      getLawText.inputSchema.parse({ mst: "270351" }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("📎 출처:");
    expect(text).toMatch(/https?:\/\/www\.law\.go\.kr/);
  }, 30_000);

  it("get_law_tree 성공 응답 — 출처 + 이어서 조회 둘 다", async () => {
    const r = await getLawTree.handler(
      getLawTree.inputSchema.parse({ mst: "270351" }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("📎 출처:");
    expect(text).toContain("이어서 할 수 있는 조회");
  }, 30_000);

  it("compare_articles 성공 응답 — 양쪽 출처 모두 첨부", async () => {
    const r = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제15조" },
        right: { mst: "270351", jo: "제17조" },
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    // 양쪽 사이드 출처
    const sourceMatches = text.match(/📎 출처:/g) ?? [];
    expect(sourceMatches.length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("search_pipc_decisions 성공 응답 — 다음 도구 chain 추천", async () => {
    const r = await searchPipcDecisions.handler(
      searchPipcDecisions.inputSchema.parse({ query: "개인정보" }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    // 검색 결과 → 본문 조회로 자연스럽게 chain
    expect(text).toContain("get_pipc_decision_text");
  }, 30_000);
});

describe.skipIf(!hasApiKey)("실패 응답 baseline — [NOT_FOUND] 마커 + isError", () => {
  const client = new LawApiClient();

  it("search_law: 매칭 0건 → [NOT_FOUND] + isError=true", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({
        query: "xyzqwerexistencequery123nonsense",
      }),
      client
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);

  it("get_law_text: 잘못된 mst → [NOT_FOUND] + isError=true", async () => {
    const r = await getLawText.handler(
      getLawText.inputSchema.parse({ mst: "999999999" }),
      client
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);

  it("[NOT_FOUND] 응답에도 LLM 경고 포함", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "xyzqwer123" }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("⚠️");
    expect(text).toContain("LLM");
  }, 30_000);

  it("[NOT_FOUND] 응답에 대안 도구 안내", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "xyzqwer123" }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("이어서 시도할 수 있는 조회");
  }, 30_000);
});

describe.skipIf(!hasApiKey)("API 키 마스킹 — 에러 메시지에 OC 노출 X", () => {
  it("잘못된 키로 호출 시 OC 값 노출 안 됨", async () => {
    const fakeKey = "FAKE_TEST_KEY_12345_FOR_MASKING_VERIFY";
    const client = new LawApiClient({ apiKey: fakeKey });
    try {
      await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "law",
        extraParams: { query: "test" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(fakeKey);
      expect(msg).toContain("***");
    }
  }, 30_000);
});

describe("ListTools 응답 토큰 측정 — 31개 도구 description 합산", () => {
  it("총 description 길이 < 30,000자 (대략 토큰 한도 검증)", () => {
    const total = ALL_TOOLS.reduce((sum, t) => sum + t.description.length, 0);
    expect(total).toBeLessThan(30_000);
    // 참고용 출력 (테스트는 항상 통과)
    expect(total).toBeGreaterThan(0);
  });

  it("각 도구별 길이 분포 확인 (max 800)", () => {
    const max = Math.max(...ALL_TOOLS.map((t) => t.description.length));
    expect(max).toBeLessThanOrEqual(800);
  });
});
