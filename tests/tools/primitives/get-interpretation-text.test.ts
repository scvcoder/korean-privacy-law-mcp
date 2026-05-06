import { describe, it, expect } from "vitest";
import { getInterpretationText } from "../../../src/tools/primitives/get-interpretation-text.js";
import { searchInterpretations } from "../../../src/tools/primitives/search-interpretations.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_interpretation_text — 정의", () => {
  it("name·description", () => {
    expect(getInterpretationText.name).toBe("get_interpretation_text");
    expect(getInterpretationText.description).toContain("법령해석례");
  });

  it("입력 스키마 — id 필수", () => {
    expect(() => getInterpretationText.inputSchema.parse({})).toThrow();
    expect(() =>
      getInterpretationText.inputSchema.parse({ id: "328859" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_interpretation_text — 실 API", () => {
  it("search → id → 해석례 본문 (질의요지·회답·이유)", async () => {
    const client = new LawApiClient();

    const search = await searchInterpretations.handler(
      searchInterpretations.inputSchema.parse({ query: "개인정보", display: 3 }),
      client
    );
    expect(search.isError).toBeFalsy();
    const text = search.content[0]?.text ?? "";
    const idMatch = text.match(/\[id=(\d+)\]/);
    expect(idMatch).toBeTruthy();
    const id = idMatch![1]!;

    const result = await getInterpretationText.handler(
      getInterpretationText.inputSchema.parse({ id }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toMatch(/안건번호:|질의기관:|회신기관:/);
    // 핵심 본문 필드 중 최소 1개 노출 (질의요지·회답·이유)
    expect(body).toMatch(/\[질의요지\]|\[회답\]|\[이유\]/);
    expect(body).toContain("출처: 법령해석례");
  }, 60_000);

  it("잘못된 id → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getInterpretationText.handler(
      getInterpretationText.inputSchema.parse({ id: "999999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
