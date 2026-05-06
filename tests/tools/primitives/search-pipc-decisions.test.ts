import { describe, it, expect } from "vitest";
import { searchPipcDecisions } from "../../../src/tools/primitives/search-pipc-decisions.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("search_pipc_decisions — 정의", () => {
  it("name·description", () => {
    expect(searchPipcDecisions.name).toBe("search_pipc_decisions");
    expect(searchPipcDecisions.description).toContain("PIPC");
    expect(searchPipcDecisions.description).toContain("결정문");
  });

  it("입력 스키마 — query 필수, display 기본 20", () => {
    expect(() => searchPipcDecisions.inputSchema.parse({})).toThrow();
    const parsed = searchPipcDecisions.inputSchema.parse({ query: "유출" });
    expect(parsed.display).toBe(20);
  });
});

describe.skipIf(!hasApiKey)("search_pipc_decisions — 실 API", () => {
  it("'개인정보' → PIPC 결정문 다수", async () => {
    const client = new LawApiClient();
    const result = await searchPipcDecisions.handler(
      searchPipcDecisions.inputSchema.parse({ query: "개인정보", display: 3 }),
      client
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PIPC 결정문");
    expect(text).toMatch(/총 \d+건/);
    // case-sensitive parsing 검증 — Ppc(root)/ppc(item) 케이스 충돌 회귀 방지
    expect(text).toMatch(/\[id=\d+\]/);
    expect(text).toContain("의결일:");
  }, 30_000);
});
