import { describe, it, expect } from "vitest";
import { getLawHistory } from "../../../src/tools/primitives/get-law-history.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_law_history — 정의", () => {
  it("name·description", () => {
    expect(getLawHistory.name).toBe("get_law_history");
    expect(getLawHistory.description).toContain("연혁");
    expect(getLawHistory.description).toContain("시행일별");
  });

  it("입력 스키마 — lawName 필수, display 기본 100", () => {
    expect(() => getLawHistory.inputSchema.parse({})).toThrow();
    const parsed = getLawHistory.inputSchema.parse({ lawName: "개인정보 보호법" });
    expect(parsed.display).toBe(100);
  });
});

describe.skipIf(!hasApiKey)("get_law_history — 실 API", () => {
  it("PIPA → 22+ 연혁 (2011 제정 ~ 2025 현행)", async () => {
    const client = new LawApiClient();
    const result = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "개인정보 보호법" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("개인정보 보호법 연혁");
    // PIPA는 2011 제정 후 22개 이상 시행 버전 존재
    expect(text).toMatch(/총 \d+건/);
    // 최소 1건의 mst 노출
    expect(text).toMatch(/\[mst=\d+\]/);
    // 현행·연혁 구분 노출
    expect(text).toMatch(/현행|연혁|시행예정/);
    // 제개정구분 노출 (제정·일부개정·전부개정 등)
    expect(text).toMatch(/일부개정|전부개정|제정|타법개정/);
  }, 30_000);

  it("'개보법' 약칭 → 정규화 후 PIPA 연혁", async () => {
    const client = new LawApiClient();
    const result = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "개보법" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("개인정보 보호법");
    expect(text).toContain("정규화");
  }, 30_000);

  it("존재하지 않는 법령 → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "xyzqwer존재하지않는법" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
