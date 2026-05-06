import { describe, it, expect } from "vitest";
import { LawApiClient } from "../../src/client/law-api-client.js";
import { LawApiError } from "../../src/lib/errors.js";
import { loadEnv } from "../../src/lib/env.js";

// 모듈 로드 시점에 .env 적용 — describe.skipIf 평가 전에 LAW_OC 사용 가능해야 함
loadEnv();

const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("LawApiClient — buildUrl", () => {
  it("필수 파라미터 OC + target + type=XML 자동 포함", () => {
    const client = new LawApiClient({ apiKey: "testkey" });
    const url = client.buildUrl(
      { endpoint: "lawSearch.do", target: "law" },
      "testkey"
    );
    expect(url).toContain("OC=testkey");
    expect(url).toContain("target=law");
    expect(url).toContain("type=XML");
    expect(url).toContain("/lawSearch.do?");
  });

  it("type override 가능 (JSON)", () => {
    const client = new LawApiClient({ apiKey: "k" });
    const url = client.buildUrl(
      { endpoint: "lawService.do", target: "law", type: "JSON" },
      "k"
    );
    expect(url).toContain("type=JSON");
  });

  it("extraParams가 URL에 포함 (한글 인코딩)", () => {
    const client = new LawApiClient({ apiKey: "k" });
    const url = client.buildUrl(
      {
        endpoint: "lawSearch.do",
        target: "law",
        extraParams: { query: "개인정보", display: "100" },
      },
      "k"
    );
    expect(url).toContain("display=100");
    expect(url).toContain("query=%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4");
  });

  it("baseUrl override 작동", () => {
    const client = new LawApiClient({
      apiKey: "k",
      baseUrl: "https://test.example.com/DRF",
    });
    const url = client.buildUrl({ endpoint: "lawSearch.do", target: "law" }, "k");
    expect(url.startsWith("https://test.example.com/DRF")).toBe(true);
  });
});

describe("LawApiClient — 인증·에러", () => {
  it("API 키 없으면 LawApiError throw", async () => {
    const client = new LawApiClient({ apiKey: "" });
    // 환경변수 LAW_OC를 없는 것처럼 — 빈 키 명시 전달로 시뮬
    const originalEnv = process.env.LAW_OC;
    delete process.env.LAW_OC;
    try {
      const c = new LawApiClient({ apiKey: "" });
      await expect(
        c.fetchApi({ endpoint: "lawSearch.do", target: "law" })
      ).rejects.toThrow(/LAW_OC API key not configured/);
    } finally {
      if (originalEnv !== undefined) process.env.LAW_OC = originalEnv;
    }
    void client;
  });

  it("호출 실패 시 에러 메시지에 OC=*** 마스킹", async () => {
    const client = new LawApiClient({
      apiKey: "supersecretkey123",
      baseUrl: "https://nonexistent.invalid.example.test/DRF",
      maxRetries: 0,
      timeoutMs: 3000,
    });
    try {
      await client.fetchApi({ endpoint: "lawSearch.do", target: "law" });
      expect.fail("호출이 성공할 수 없음");
    } catch (err) {
      expect(err).toBeInstanceOf(LawApiError);
      const message = (err as Error).message;
      expect(message).toContain("OC=***");
      expect(message).not.toContain("supersecretkey123");
    }
  }, 10_000);
});

describe.skipIf(!hasApiKey)("LawApiClient — 실 API 호출", () => {
  it("search_law: '개인정보 보호법' 조회 → totalCnt > 0", async () => {
    const client = new LawApiClient();
    const xml = await client.fetchApi({
      endpoint: "lawSearch.do",
      target: "law",
      extraParams: { query: "개인정보 보호법", display: "5" },
    });
    expect(xml).toContain("<LawSearch>");
    expect(xml).toMatch(/<totalCnt>\d+<\/totalCnt>/);
    expect(xml).toContain("개인정보");
  }, 30_000);

  it("display=100 으로 짧은 법령명도 회수", async () => {
    const client = new LawApiClient();
    const xml = await client.fetchApi({
      endpoint: "lawSearch.do",
      target: "law",
      extraParams: { query: "상법", display: "100" },
    });
    expect(xml).toContain("<LawSearch>");
    // 결과 안에 "상법"이 있어야 함 (display=20 이하면 누락 케이스 발생)
    expect(xml).toMatch(/상법/);
  }, 30_000);
});
