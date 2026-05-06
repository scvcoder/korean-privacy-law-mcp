import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ALL_TOOLS, findTool } from "../src/tools/registry.js";
import {
  createServer,
  SERVER_NAME,
  SERVER_VERSION,
  SERVER_DESCRIPTION,
} from "../src/server.js";
import { LawApiClient } from "../src/client/law-api-client.js";

describe("도구 레지스트리", () => {
  it("도구 37개 모두 등록됨 (Layer A 31 + Layer B+ 2 + Layer C 3 + Validator 1)", () => {
    expect(ALL_TOOLS).toHaveLength(37);
    const names = ALL_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "compare_admin_rule_old_new",
      "compare_articles",
      "compare_old_new",
      "get_admin_appeal_text",
      "get_admin_rule_text",
      "get_annexes",
      "get_article_change_history",
      "get_constitutional_decision_text",
      "get_delegated_laws",
      "get_english_law_text",
      "get_historical_law",
      "get_intelligent_related_laws",
      "get_interpretation_text",
      "get_law_abbreviations",
      "get_law_history",
      "get_law_system_tree",
      "get_law_text",
      "get_law_tree",
      "get_legal_term",
      "get_pipc_curated_corpus",
      "get_pipc_decision_text",
      "get_related_laws",
      "get_sectoral_related_laws",
      "get_term_articles",
      "get_three_tier",
      "intelligent_law_search",
      "search_admin_appeals",
      "search_admin_rule",
      "search_constitutional_decisions",
      "search_english_law",
      "search_interpretations",
      "search_law",
      "search_pipc_decisions",
      "search_privacy_cases",
      "search_privacy_corpus",
      "search_privacy_guides",
      "verify_pipa_citation",
    ]);
  });

  it("findTool: 존재하는 이름 → Tool", () => {
    expect(findTool("search_law")?.name).toBe("search_law");
    expect(findTool("get_law_text")?.name).toBe("get_law_text");
  });

  it("findTool: 모르는 이름 → undefined", () => {
    expect(findTool("nonexistent")).toBeUndefined();
  });

  it("모든 도구가 description·inputSchema 정의됨", () => {
    for (const t of ALL_TOOLS) {
      expect(t.description.length).toBeGreaterThan(50);
      expect(t.description).toMatch(/다음/);
      expect(t.inputSchema).toBeDefined();
    }
  });

  it("각 도구 inputSchema가 JSON Schema로 변환 가능", () => {
    for (const t of ALL_TOOLS) {
      const schema = zodToJsonSchema(t.inputSchema, { target: "openApi3" });
      expect(schema).toBeDefined();
      expect(typeof schema).toBe("object");
    }
  });
});

describe("createServer", () => {
  it("서버 인스턴스 생성", () => {
    const client = new LawApiClient({ apiKey: "test" });
    const server = createServer(client);
    expect(server).toBeDefined();
  });

  it("서버 메타데이터 — name·version·description", () => {
    expect(SERVER_NAME).toBe("korean-privacy-law-mcp");
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(SERVER_DESCRIPTION).toContain("개인정보보호법");
    expect(SERVER_DESCRIPTION).toContain("일반 법령 조회는 가능");
    expect(SERVER_DESCRIPTION).toContain("한계");
  });
});
