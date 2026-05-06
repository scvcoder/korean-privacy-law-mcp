import { describe, it, expect } from "vitest";
import { getLawSystemTree } from "../../../src/tools/primitives/get-law-system-tree.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_law_system_tree — 정의", () => {
  it("name·description", () => {
    expect(getLawSystemTree.name).toBe("get_law_system_tree");
    expect(getLawSystemTree.description).toContain("체계도");
    expect(getLawSystemTree.description).toContain("트리");
  });

  it("입력 스키마 — mst 또는 lawId 필수", () => {
    expect(() => getLawSystemTree.inputSchema.parse({})).toThrow();
    expect(() =>
      getLawSystemTree.inputSchema.parse({ mst: "270351" })
    ).not.toThrow();
    expect(() =>
      getLawSystemTree.inputSchema.parse({ lawId: "011357" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_law_system_tree — 실 API", () => {
  it("PIPA (mst=270351) 체계도 트리", async () => {
    const client = new LawApiClient();
    const result = await getLawSystemTree.handler(
      getLawSystemTree.inputSchema.parse({ mst: "270351" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보 보호법");
    expect(body).toContain("법령 체계도");
    // 들여쓰기 트리 (- 마커)
    expect(body).toMatch(/^\s+- /m);
    // 카테고리 헤더 (법률·행정규칙·고시·훈령 등)
    expect(body).toMatch(/\[(상하위법|관련법령|법률|행정규칙|시행령|고시|훈령)\]/);
  }, 30_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getLawSystemTree.handler(
      getLawSystemTree.inputSchema.parse({ mst: "999999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
