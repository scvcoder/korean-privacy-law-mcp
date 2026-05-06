import { describe, it, expect } from "vitest";
import { getConstitutionalDecisionText } from "../../../src/tools/primitives/get-constitutional-decision-text.js";
import { searchConstitutionalDecisions } from "../../../src/tools/primitives/search-constitutional-decisions.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_constitutional_decision_text — 정의", () => {
  it("name·description", () => {
    expect(getConstitutionalDecisionText.name).toBe("get_constitutional_decision_text");
    expect(getConstitutionalDecisionText.description).toContain("헌재");
    expect(getConstitutionalDecisionText.description).toContain("자기결정권");
  });

  it("입력 스키마 — id 필수", () => {
    expect(() => getConstitutionalDecisionText.inputSchema.parse({})).toThrow();
    expect(() =>
      getConstitutionalDecisionText.inputSchema.parse({ id: "48654" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_constitutional_decision_text — 실 API", () => {
  it("search → id → 헌재 결정문 본문", async () => {
    const client = new LawApiClient();

    // search로 헌재 결정례 ID 획득 — '개인정보' 키워드 (29건 매칭)
    const search = await searchConstitutionalDecisions.handler(
      searchConstitutionalDecisions.inputSchema.parse({
        query: "개인정보",
        display: 3,
      }),
      client
    );
    expect(search.isError).toBeFalsy();
    const text = search.content[0]?.text ?? "";
    const idMatch = text.match(/\[id=(\d+)\]/);
    expect(idMatch).toBeTruthy();
    const id = idMatch![1]!;

    // 결정문 본문 조회
    const result = await getConstitutionalDecisionText.handler(
      getConstitutionalDecisionText.inputSchema.parse({ id }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("사건번호:");
    expect(body).toContain("종국일자:");
    expect(body).toContain("출처: 헌법재판소");
  }, 60_000);

  it("잘못된 id → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getConstitutionalDecisionText.handler(
      getConstitutionalDecisionText.inputSchema.parse({ id: "99999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
