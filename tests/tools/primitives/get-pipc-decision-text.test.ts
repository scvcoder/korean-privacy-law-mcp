import { describe, it, expect } from "vitest";
import { getPipcDecisionText } from "../../../src/tools/primitives/get-pipc-decision-text.js";
import { searchPipcDecisions } from "../../../src/tools/primitives/search-pipc-decisions.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_pipc_decision_text — 정의", () => {
  it("name·description", () => {
    expect(getPipcDecisionText.name).toBe("get_pipc_decision_text");
    expect(getPipcDecisionText.description).toContain("PIPC");
    expect(getPipcDecisionText.description).toContain("결정문");
  });

  it("입력 스키마 — id 필수", () => {
    expect(() => getPipcDecisionText.inputSchema.parse({})).toThrow();
    expect(() =>
      getPipcDecisionText.inputSchema.parse({ id: "9459" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_pipc_decision_text — 실 API", () => {
  it("search → id → 결정문 본문 (구조화 필드)", async () => {
    const client = new LawApiClient();

    // search로 결정문 ID 획득
    const search = await searchPipcDecisions.handler(
      searchPipcDecisions.inputSchema.parse({ query: "개인정보", display: 3 }),
      client
    );
    expect(search.isError).toBeFalsy();
    const text = search.content[0]?.text ?? "";
    const idMatch = text.match(/\[id=(\d+)\]/);
    expect(idMatch).toBeTruthy();
    const id = idMatch![1]!;

    // 결정문 본문 조회
    const result = await getPipcDecisionText.handler(
      getPipcDecisionText.inputSchema.parse({ id }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    // 핵심 메타 필드 노출
    expect(body).toMatch(/안건번호:/);
    expect(body).toMatch(/의결일:/);
    expect(body).toMatch(/결정:/);
    // 출처 첨부
    expect(body).toContain("출처: 개인정보보호위원회 결정문");
  }, 60_000);

  it("잘못된 id → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getPipcDecisionText.handler(
      getPipcDecisionText.inputSchema.parse({ id: "99999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
