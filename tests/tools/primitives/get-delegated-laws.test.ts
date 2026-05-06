import { describe, it, expect } from "vitest";
import { getDelegatedLaws } from "../../../src/tools/primitives/get-delegated-laws.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_delegated_laws — 정의", () => {
  it("name·description", () => {
    expect(getDelegatedLaws.name).toBe("get_delegated_laws");
    expect(getDelegatedLaws.description).toContain("위임조문");
  });

  it("입력 스키마 — lawId 필수", () => {
    expect(() => getDelegatedLaws.inputSchema.parse({})).toThrow();
    expect(() =>
      getDelegatedLaws.inputSchema.parse({ lawId: "011357" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_delegated_laws — 실 API", () => {
  it("PIPA (lawId=011357) 위임조문 59+ 건", async () => {
    const client = new LawApiClient();
    const result = await getDelegatedLaws.handler(
      getDelegatedLaws.inputSchema.parse({ lawId: "011357" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보 보호법");
    expect(body).toContain("위임조문");
    expect(body).toMatch(/위임조문 \d+건/);
    // 위임 표시 트리
    expect(body).toContain("└─");
    expect(body).toMatch(/제\d+조/);
  }, 30_000);

  it("잘못된 lawId → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getDelegatedLaws.handler(
      getDelegatedLaws.inputSchema.parse({ lawId: "999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
