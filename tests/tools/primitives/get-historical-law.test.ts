import { describe, it, expect } from "vitest";
import { getHistoricalLaw } from "../../../src/tools/primitives/get-historical-law.js";
import { getLawHistory } from "../../../src/tools/primitives/get-law-history.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_historical_law — 정의", () => {
  it("name·description", () => {
    expect(getHistoricalLaw.name).toBe("get_historical_law");
    expect(getHistoricalLaw.description).toContain("시점");
    expect(getHistoricalLaw.description).toContain("get_law_history");
  });

  it("입력 스키마 — mst 필수", () => {
    expect(() => getHistoricalLaw.inputSchema.parse({})).toThrow();
    expect(() =>
      getHistoricalLaw.inputSchema.parse({ mst: "111327" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_historical_law — 실 API", () => {
  it("PIPA 제정 시점 (mst=111327, 2011.09) 본문", async () => {
    const client = new LawApiClient();
    const result = await getHistoricalLaw.handler(
      getHistoricalLaw.inputSchema.parse({ mst: "111327" }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("개인정보 보호법");
    expect(body).toContain("시행 2011");
    expect(body).toContain("mst: 111327");
    expect(body).toMatch(/\[제\d+조/);
  }, 30_000);

  it("get_law_history → mst → get_historical_law chain", async () => {
    const client = new LawApiClient();

    // history로 mst 획득
    const history = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "개인정보 보호법" }),
      client
    );
    expect(history.isError).toBeFalsy();
    const text = history.content[0]?.text ?? "";
    const matches = [...text.matchAll(/\[mst=(\d+)\]/g)];
    expect(matches.length).toBeGreaterThan(0);
    // 마지막 항목 (시행일 desc 정렬이라 가장 오래된)
    const oldestMst = matches[matches.length - 1]![1]!;

    // 해당 시점 본문
    const result = await getHistoricalLaw.handler(
      getHistoricalLaw.inputSchema.parse({ mst: oldestMst }),
      client
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("개인정보 보호법");
  }, 60_000);

  it("잘못된 mst → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getHistoricalLaw.handler(
      getHistoricalLaw.inputSchema.parse({ mst: "999999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
