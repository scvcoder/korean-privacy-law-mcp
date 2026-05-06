import { describe, it, expect } from "vitest";
import { compareArticles } from "../../../src/tools/primitives/compare-articles.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("compare_articles — 정의", () => {
  it("name·description", () => {
    expect(compareArticles.name).toBe("compare_articles");
    expect(compareArticles.description).toContain("side-by-side");
    expect(compareArticles.description).toContain("JO");
  });

  it("입력 스키마 — left·right 모두 필수", () => {
    expect(() => compareArticles.inputSchema.parse({})).toThrow();
    expect(() =>
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제15조" },
      })
    ).toThrow();
    expect(() =>
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제15조" },
        right: { mst: "270351", jo: "제17조" },
      })
    ).not.toThrow();
  });

  it("efYd 형식 검증 — 8자리 숫자만 통과", () => {
    expect(() =>
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제15조", efYd: "20251002" },
        right: { mst: "270351", jo: "제17조" },
      })
    ).not.toThrow();
    expect(() =>
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제15조", efYd: "2025-10-02" },
        right: { mst: "270351", jo: "제17조" },
      })
    ).toThrow();
  });
});

describe.skipIf(!hasApiKey)("compare_articles — 실 API", () => {
  it("PIPA §15 vs §17 비교", async () => {
    const client = new LawApiClient();
    const result = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제15조" },
        right: { mst: "270351", jo: "제17조" },
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("조문 비교");
    expect(body).toContain("[LEFT]");
    expect(body).toContain("[RIGHT]");
    expect(body).toContain("개인정보 보호법");
    expect(body).toContain("[제15조]");
    expect(body).toContain("[제17조]");
    expect(body).toContain("📎 출처:");
  }, 60_000);

  it("6자리 JO코드 직접 입력도 동작", async () => {
    const client = new LawApiClient();
    const result = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "001500" },
        right: { mst: "270351", jo: "001700" },
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("[제15조]");
  }, 60_000);

  it("가지번호 — PIPA §28의2 vs §28의4", async () => {
    const client = new LawApiClient();
    const result = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제28조의2" },
        right: { mst: "270351", jo: "제28조의4" },
      }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("[제28조의2]");
    expect(body).toContain("[제28조의4]");
  }, 60_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "999999999", jo: "제15조" },
        right: { mst: "270351", jo: "제17조" },
      }),
      client
    );
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("[NOT_FOUND]");
    expect(text).toContain("left:");
  }, 30_000);

  it("존재하지 않는 조문 → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제999조" },
        right: { mst: "270351", jo: "제17조" },
      }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
