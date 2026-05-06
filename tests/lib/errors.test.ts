import { describe, it, expect } from "vitest";
import { LawApiError, ValidationError, formatToolError, maskApiKey } from "../../src/lib/errors.js";

describe("maskApiKey", () => {
  it("OC 파라미터를 *** 로 마스킹", () => {
    const url = "https://www.law.go.kr/DRF/lawSearch.do?OC=mySecret123&target=law";
    expect(maskApiKey(url)).toBe("https://www.law.go.kr/DRF/lawSearch.do?OC=***&target=law");
  });

  it("URL 끝 OC도 마스킹", () => {
    expect(maskApiKey("...?target=law&OC=secretKey")).toContain("OC=***");
    expect(maskApiKey("...?target=law&OC=secretKey")).not.toContain("secretKey");
  });

  it("OC가 없으면 원문 그대로", () => {
    expect(maskApiKey("Network error")).toBe("Network error");
  });

  it("대소문자 무관 (oc=)", () => {
    expect(maskApiKey("...oc=lower&x=y")).toContain("OC=***");
  });
});

describe("LawApiError", () => {
  it("statusCode 보존", () => {
    const e = new LawApiError("API failed", 500);
    expect(e.statusCode).toBe(500);
    expect(e.name).toBe("LawApiError");
  });
});

describe("ValidationError", () => {
  it("name 식별 가능", () => {
    const e = new ValidationError("invalid input");
    expect(e.name).toBe("ValidationError");
  });
});

describe("formatToolError", () => {
  it("Error 인스턴스 처리 + 마스킹", () => {
    const e = new LawApiError("Failed: OC=secret&target=law");
    const r = formatToolError(e, "search_law");
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("[ERROR]");
    expect(r.content[0]?.text).toContain("search_law");
    expect(r.content[0]?.text).toContain("OC=***");
    expect(r.content[0]?.text).not.toContain("secret");
  });

  it("non-Error 값도 처리", () => {
    const r = formatToolError("string error", "tool");
    expect(r.content[0]?.text).toContain("string error");
  });
});
