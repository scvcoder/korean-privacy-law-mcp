import { describe, it, expect } from "vitest";
import { getLawTree } from "../../../src/tools/primitives/get-law-tree.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_law_tree — 정의", () => {
  it("name·description", () => {
    expect(getLawTree.name).toBe("get_law_tree");
    expect(getLawTree.description).toContain("편·장·절");
    expect(getLawTree.description).toContain("PIPA");
  });

  it("입력 스키마 — mst 또는 lawId 필수", () => {
    expect(() => getLawTree.inputSchema.parse({})).toThrow();
    expect(() => getLawTree.inputSchema.parse({ mst: "270351" })).not.toThrow();
    expect(() => getLawTree.inputSchema.parse({ lawId: "011357" })).not.toThrow();
  });

  it("efYd 형식 검증", () => {
    expect(() =>
      getLawTree.inputSchema.parse({ mst: "270351", efYd: "2025-10-02" })
    ).toThrow();
    expect(() =>
      getLawTree.inputSchema.parse({ mst: "270351", efYd: "20251002" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_law_tree — 실 API", () => {
  it("PIPA (mst=270351) → 10장 + 4절 트리", async () => {
    const client = new LawApiClient();
    const result = await getLawTree.handler(
      getLawTree.inputSchema.parse({ mst: "270351" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보 보호법");
    expect(body).toContain("목차 트리");
    expect(body).toMatch(/헤더 \d+개/);
    expect(body).toMatch(/조문 \d+개/);
    // 장·절 헤더 prefix 검증
    expect(body).toContain("제1장 총칙");
    expect(body).toContain("제3장 개인정보의 처리");
    expect(body).toMatch(/제\d+절/);
    // 조문 범위 표시
    expect(body).toMatch(/\[제\d+조 ~ 제\d+조[^\]]*\]/);
  }, 30_000);

  it("들여쓰기 — 절은 장보다 더 들여써짐", async () => {
    const client = new LawApiClient();
    const result = await getLawTree.handler(
      getLawTree.inputSchema.parse({ mst: "270351" }),
      client
    );
    const body = result.content[0]?.text ?? "";
    // "제1장 총칙"은 line 시작
    expect(body).toMatch(/^├─ 제1장 총칙/m);
    // "제1절"은 indent 후 시작
    expect(body).toMatch(/^│\s+├─ 제1절/m);
  }, 30_000);

  it("get_law_text보다 더 가벼운 응답 (구조만)", async () => {
    const client = new LawApiClient();
    const result = await getLawTree.handler(
      getLawTree.inputSchema.parse({ mst: "270351" }),
      client
    );
    const body = result.content[0]?.text ?? "";
    // 본문 없이 구조만 — 길이 단순 비교 (PIPA 본문은 12K cap 가까이, 트리는 1~2K)
    expect(body.length).toBeLessThan(5_000);
  }, 30_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getLawTree.handler(
      getLawTree.inputSchema.parse({ mst: "999999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);

  it("이어서 할 수 있는 조회에 get_law_text·compare_articles 포함", async () => {
    const client = new LawApiClient();
    const result = await getLawTree.handler(
      getLawTree.inputSchema.parse({ mst: "270351" }),
      client
    );
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("get_law_text");
    expect(body).toContain("compare_articles");
  }, 30_000);
});
