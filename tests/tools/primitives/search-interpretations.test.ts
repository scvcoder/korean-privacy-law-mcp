import { describe, it, expect } from "vitest";
import { searchInterpretations } from "../../../src/tools/primitives/search-interpretations.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("search_interpretations — 정의", () => {
  it("name·description", () => {
    expect(searchInterpretations.name).toBe("search_interpretations");
    expect(searchInterpretations.description).toContain("법령해석례");
  });

  it("입력 스키마 — query 필수", () => {
    expect(() => searchInterpretations.inputSchema.parse({})).toThrow();
  });
});

describe.skipIf(!hasApiKey)("search_interpretations — 실 API", () => {
  it("'개인정보' → 해석례 다수", async () => {
    const client = new LawApiClient();
    const result = await searchInterpretations.handler(
      searchInterpretations.inputSchema.parse({ query: "개인정보", display: 3 }),
      client
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("법령해석례");
    expect(text).toMatch(/총 \d+건/);
  }, 30_000);
});
