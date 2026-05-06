import { describe, it, expect } from "vitest";
import { getLegalTerm } from "../../../src/tools/primitives/get-legal-term.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_legal_term — 정의", () => {
  it("name·description", () => {
    expect(getLegalTerm.name).toBe("get_legal_term");
    expect(getLegalTerm.description).toContain("법령용어");
    expect(getLegalTerm.description).toContain("lstrm");
  });

  it("입력 스키마 — query 필수, display 기본 5", () => {
    expect(() => getLegalTerm.inputSchema.parse({})).toThrow();
    const parsed = getLegalTerm.inputSchema.parse({ query: "개인정보" });
    expect(parsed.display).toBe(5);
    expect(parsed.page).toBe(1);
    expect(parsed.withDefinitions).toBe(true);
  });

  it("display 상한 20", () => {
    expect(() =>
      getLegalTerm.inputSchema.parse({ query: "x", display: 50 })
    ).toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_legal_term — 실 API", () => {
  it("'개인정보' → 매칭 용어 + 정의", async () => {
    const client = new LawApiClient();
    const result = await getLegalTerm.handler(
      getLegalTerm.inputSchema.parse({ query: "개인정보", display: 3 }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("법령용어");
    expect(body).toMatch(/총 \d+건/);
    expect(body).toContain("trmSeqs:");
    // 정의 본문 자동 fetch 됐는지 — 출처 마커 또는 정의 출력
    expect(body).toMatch(/📖|정의 본문/);
  }, 30_000);

  it("withDefinitions=false → 정의 미포함, 목록만", async () => {
    const client = new LawApiClient();
    const result = await getLegalTerm.handler(
      getLegalTerm.inputSchema.parse({
        query: "개인정보",
        display: 3,
        withDefinitions: false,
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("trmSeqs:");
    // 출처/정의 마커가 없어야 함
    expect(body).not.toContain("📖");
  }, 30_000);

  it("'가명정보' → 정의 첨부 확인", async () => {
    const client = new LawApiClient();
    const result = await getLegalTerm.handler(
      getLegalTerm.inputSchema.parse({ query: "가명정보", display: 2 }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("가명정보");
  }, 30_000);

  it("결과 0 → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getLegalTerm.handler(
      getLegalTerm.inputSchema.parse({
        query: "xyzqwerexistencequery123nonsense",
      }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
