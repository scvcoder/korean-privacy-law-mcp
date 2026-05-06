import { describe, it, expect } from "vitest";
import { getRelatedLaws } from "../../../src/tools/primitives/get-related-laws.js";
import { searchLaw } from "../../../src/tools/primitives/search-law.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_related_laws — 도구 정의", () => {
  it("name·description 정의됨", () => {
    expect(getRelatedLaws.name).toBe("get_related_laws");
    expect(getRelatedLaws.description).toContain("관련 법령");
    expect(getRelatedLaws.description).toContain("체계도");
    expect(getRelatedLaws.description).toContain("하위");
  });

  it("입력 스키마 — mst 또는 lawId 필수", () => {
    expect(() => getRelatedLaws.inputSchema.parse({})).toThrow();
    expect(() =>
      getRelatedLaws.inputSchema.parse({ mst: "270351" })
    ).not.toThrow();
    expect(() =>
      getRelatedLaws.inputSchema.parse({ lawId: "011357" })
    ).not.toThrow();
  });

  it("입력 스키마 — lawName 미지원 (search_law 우선 호출 강제)", () => {
    expect(() =>
      getRelatedLaws.inputSchema.parse({ lawName: "개인정보 보호법" })
    ).toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_related_laws — 실 API", () => {
  it("search_law → mst → 관련 법령 (PIPA의 시행령·고시·훈령)", async () => {
    const client = new LawApiClient();

    // search로 mst 획득
    const search = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개인정보 보호법" }),
      client
    );
    expect(search.isError).toBeFalsy();
    const text = search.content[0]?.text ?? "";
    const mstMatch = text.match(/mst=(\d+)/);
    expect(mstMatch).toBeTruthy();
    const mst = mstMatch![1]!;

    // 체계도 조회
    const result = await getRelatedLaws.handler(
      getRelatedLaws.inputSchema.parse({ mst }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("관련 법령·하위 규칙");
    expect(body).toContain("개인정보 보호법");
    // PIPA에는 시행령·시행규칙·고시 등 하위 규칙이 다수 있음
    expect(body.length).toBeGreaterThan(200);
  }, 60_000);

  it("잘못된 mst → [NOT_FOUND] 또는 빈 응답", async () => {
    const client = new LawApiClient();
    const result = await getRelatedLaws.handler(
      getRelatedLaws.inputSchema.parse({ mst: "999999999" }),
      client
    );
    // API가 빈 본문 또는 에러를 반환 — 우리 핸들러는 모두 [NOT_FOUND]로 처리
    expect(result.isError).toBe(true);
  }, 30_000);
});
