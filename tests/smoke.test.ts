/**
 * E2E smoke test — 빌드된 stdio 서버를 MCP Client SDK로 직접 호출.
 * `npm run build` 후 실행 (skipIf로 자동 skip).
 */

import { describe, it, expect, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../src/lib/env.js";

loadEnv();
const distPath = resolve("dist/index.js");
const built = existsSync(distPath);
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe.skipIf(!built)("MCP server E2E (stdio)", () => {
  let client: Client | null = null;

  async function getClient(): Promise<Client> {
    if (client) return client;
    const transport = new StdioClientTransport({
      command: "node",
      args: [distPath],
      env: {
        ...process.env,
        LAW_OC: process.env.LAW_OC ?? "",
      } as Record<string, string>,
    });
    const c = new Client({ name: "smoke-test", version: "0.0.1" }, { capabilities: {} });
    await c.connect(transport);
    client = c;
    return c;
  }

  afterAll(async () => {
    if (client) await client.close();
  });

  it("initialize → server name/version 응답", async () => {
    const c = await getClient();
    const info = c.getServerVersion();
    expect(info?.name).toBe("korean-privacy-law-mcp");
    expect(info?.version).toBe("0.0.1");
  }, 15_000);

  it("server.instructions → 도메인 명시 포함", async () => {
    const c = await getClient();
    const instr = c.getInstructions();
    expect(instr).toBeDefined();
    expect(instr).toContain("개인정보보호법");
    expect(instr).toContain("일반 법령 조회는 가능");
  }, 15_000);

  it("ListTools → 37개 도구 노출 (Layer A 31 + Layer B+ 2 + Layer C 3 + Validator 1)", async () => {
    const c = await getClient();
    const result = await c.listTools();
    expect(result.tools).toHaveLength(37);
    const names = result.tools.map((t) => t.name).sort();
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
  }, 15_000);

  it("각 도구 inputSchema가 JSON Schema 형식", async () => {
    const c = await getClient();
    const result = await c.listTools();
    for (const t of result.tools) {
      expect(t.inputSchema).toBeDefined();
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema).toHaveProperty("properties");
    }
  }, 15_000);

  it.skipIf(!hasApiKey)(
    "CallTool: search_law(개인정보 보호법) 응답",
    async () => {
      const c = await getClient();
      const result = await c.callTool({
        name: "search_law",
        arguments: { query: "개인정보 보호법" },
      });
      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("개인정보 보호법");
      expect(content[0]?.text).toContain("mst=");
      expect(content[0]?.text).toContain("이어서 할 수 있는 조회");
    },
    30_000
  );

  it("CallTool: 알 수 없는 도구 → [NOT_FOUND]", async () => {
    const c = await getClient();
    const result = await c.callTool({
      name: "nonexistent_tool",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("[NOT_FOUND]");
    expect(content[0]?.text).toContain("nonexistent_tool");
  }, 15_000);

  it("CallTool: 잘못된 인자 (zod 검증 실패) → [ERROR]", async () => {
    const c = await getClient();
    const result = await c.callTool({
      name: "search_law",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("[ERROR]");
    expect(content[0]?.text).toContain("search_law");
  }, 15_000);
});
