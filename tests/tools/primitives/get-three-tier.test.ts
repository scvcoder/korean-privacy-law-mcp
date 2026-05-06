import { describe, it, expect } from "vitest";
import { getThreeTier } from "../../../src/tools/primitives/get-three-tier.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_three_tier — 정의", () => {
  it("name·description", () => {
    expect(getThreeTier.name).toBe("get_three_tier");
    expect(getThreeTier.description).toContain("3단");
    expect(getThreeTier.description).toContain("위임");
  });

  it("입력 스키마 — mst 필수, knd 기본 2", () => {
    expect(() => getThreeTier.inputSchema.parse({})).toThrow();
    const parsed = getThreeTier.inputSchema.parse({ mst: "270351" });
    expect(parsed.knd).toBe("2");
  });

  it("knd enum 검증", () => {
    expect(() =>
      getThreeTier.inputSchema.parse({ mst: "270351", knd: "3" })
    ).toThrow();
    expect(() =>
      getThreeTier.inputSchema.parse({ mst: "270351", knd: "1" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_three_tier — 실 API", () => {
  it("PIPA 위임조문 (knd=2)", async () => {
    const client = new LawApiClient();
    const result = await getThreeTier.handler(
      getThreeTier.inputSchema.parse({ mst: "270351", knd: "2" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보 보호법");
    expect(body).toContain("3단비교");
    expect(body).toContain("위임조문");
    expect(body).toMatch(/제\d+조/);
    // 시행령 위임 관계 노출
    expect(body).toContain("└─");
  }, 30_000);

  it("PIPA 인용조문 (knd=1)", async () => {
    const client = new LawApiClient();
    const result = await getThreeTier.handler(
      getThreeTier.inputSchema.parse({ mst: "270351", knd: "1" }),
      client
    );
    // root key가 다름 (ThdCmpLawXService), 결과는 있을 수도 없을 수도
    const body = result.content[0]?.text ?? "";
    if (!result.isError) {
      expect(body).toContain("3단비교");
      expect(body).toContain("인용조문");
    } else {
      expect(body).toContain("[NOT_FOUND]");
    }
  }, 30_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getThreeTier.handler(
      getThreeTier.inputSchema.parse({ mst: "999999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
