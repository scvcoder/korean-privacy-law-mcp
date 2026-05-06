import { describe, it, expect } from "vitest";
import { getAdminAppealText } from "../../../src/tools/primitives/get-admin-appeal-text.js";
import { searchAdminAppeals } from "../../../src/tools/primitives/search-admin-appeals.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("get_admin_appeal_text — 정의", () => {
  it("name·description", () => {
    expect(getAdminAppealText.name).toBe("get_admin_appeal_text");
    expect(getAdminAppealText.description).toContain("행정심판");
    expect(getAdminAppealText.description).toContain("재결례");
  });

  it("입력 스키마 — id 필수", () => {
    expect(() => getAdminAppealText.inputSchema.parse({})).toThrow();
    expect(() =>
      getAdminAppealText.inputSchema.parse({ id: "257607" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("get_admin_appeal_text — 실 API", () => {
  it("search → id → 재결례 본문", async () => {
    const client = new LawApiClient();

    const search = await searchAdminAppeals.handler(
      searchAdminAppeals.inputSchema.parse({ query: "개인정보", display: 3 }),
      client
    );
    expect(search.isError).toBeFalsy();
    const text = search.content[0]?.text ?? "";
    const idMatch = text.match(/\[id=(\d+)\]/);
    expect(idMatch).toBeTruthy();
    const id = idMatch![1]!;

    const result = await getAdminAppealText.handler(
      getAdminAppealText.inputSchema.parse({ id }),
      client
    );
    expect(result.isError).toBeFalsy();
    const body = result.content[0]?.text ?? "";
    expect(body).toContain("사건번호:");
    expect(body).toMatch(/재결청:|의결일자:/);
    expect(body).toContain("출처: 행정심판");
  }, 60_000);

  it("잘못된 id → [NOT_FOUND]", async () => {
    const client = new LawApiClient();
    const result = await getAdminAppealText.handler(
      getAdminAppealText.inputSchema.parse({ id: "99999999" }),
      client
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("[NOT_FOUND]");
  }, 30_000);
});
