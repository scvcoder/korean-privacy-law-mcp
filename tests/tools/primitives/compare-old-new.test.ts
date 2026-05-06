import { describe, it, expect } from "vitest";
import { compareOldNew } from "../../../src/tools/primitives/compare-old-new.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("compare_old_new — 정의", () => {
  it("name·description", () => {
    expect(compareOldNew.name).toBe("compare_old_new");
    expect(compareOldNew.description).toContain("신구법");
    expect(compareOldNew.description).toContain("PIPA");
  });

  it("입력 스키마 — mst 필수", () => {
    expect(() => compareOldNew.inputSchema.parse({})).toThrow();
    expect(() =>
      compareOldNew.inputSchema.parse({ mst: "270351" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("compare_old_new — 실 API", () => {
  it("PIPA 현행 (mst=270351) 신구 비교", async () => {
    const client = new LawApiClient();
    const result = await compareOldNew.handler(
      compareOldNew.inputSchema.parse({ mst: "270351" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보 보호법");
    expect(body).toContain("신구법 비교");
    expect(body).toMatch(/\[구조문\]|\[신조문\]/);
    // 변경 부분 markdown bold 강조
    expect(body).toMatch(/\*\*[^*]+\*\*/);
  }, 60_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await compareOldNew.handler(
      compareOldNew.inputSchema.parse({ mst: "999999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
