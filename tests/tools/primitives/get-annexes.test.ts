import { describe, it, expect } from "vitest";
import { getAnnexes } from "../../../src/tools/primitives/get-annexes.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_annexes — 도구 정의", () => {
  it("name·description 정의됨", () => {
    expect(getAnnexes.name).toBe("get_annexes");
    expect(getAnnexes.description).toContain("별표");
    expect(getAnnexes.description).toContain("서식");
  });

  it("입력 스키마 — lawName 필수, knd 기본 '5'", () => {
    expect(() => getAnnexes.inputSchema.parse({})).toThrow();
    const parsed = getAnnexes.inputSchema.parse({ lawName: "개보법" });
    expect(parsed.knd).toBe("5");
    expect(parsed.display).toBe(100);
  });

  it("입력 스키마 — knd enum 검증", () => {
    expect(() =>
      getAnnexes.inputSchema.parse({ lawName: "x", knd: "9" })
    ).toThrow();
    expect(() =>
      getAnnexes.inputSchema.parse({ lawName: "x", knd: "1" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_annexes — 실 API", () => {
  it("'개인정보 보호법' 별표·서식 조회", async () => {
    const client = new LawApiClient();
    const result = await getAnnexes.handler(
      getAnnexes.inputSchema.parse({ lawName: "개인정보 보호법" }),
      client
    );
    const text = result.content[0]?.text ?? "";
    if (result.isError) {
      // 별표 없는 법령일 수도 있음
      expect(text).toContain("[NOT_FOUND]");
    } else {
      expect(text).toContain("별표·서식");
    }
  }, 30_000);

  it("존재하지 않는 법령 → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getAnnexes.handler(
      getAnnexes.inputSchema.parse({ lawName: "xyzqwer존재하지않는법" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
