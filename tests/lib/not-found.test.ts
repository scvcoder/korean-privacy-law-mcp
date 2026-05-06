import { describe, it, expect } from "vitest";
import {
  MARKERS,
  notFoundResponse,
  outOfScopeResponse,
  notFoundScopeResponse,
  hallucinationDetectedResponse,
} from "../../src/lib/not-found.js";

describe("MARKERS", () => {
  it("4종 표준 마커가 모두 존재", () => {
    expect(MARKERS.NOT_FOUND).toBe("[NOT_FOUND]");
    expect(MARKERS.HALLUCINATION_DETECTED).toBe("[HALLUCINATION_DETECTED]");
    expect(MARKERS.OUT_OF_SCOPE).toBe("[OUT_OF_SCOPE]");
    expect(MARKERS.NOT_FOUND_SCOPE).toBe("[NOT_FOUND_SCOPE]");
  });
});

describe("notFoundResponse", () => {
  it("isError=true 와 [NOT_FOUND] prefix를 항상 포함", () => {
    const r = notFoundResponse("법령 없음");
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("[NOT_FOUND]");
    expect(r.content[0]?.text).toContain("법령 없음");
    expect(r.content[0]?.text).toContain("LLM은 추측·생성 금지");
  });

  it("suggestions가 있으면 응답에 포함", () => {
    const r = notFoundResponse("법령 없음", ["search_law(query=...)"]);
    expect(r.content[0]?.text).toContain("이어서 시도할 수 있는 조회");
    expect(r.content[0]?.text).toContain("search_law(query=...)");
  });
});

describe("outOfScopeResponse", () => {
  it("[OUT_OF_SCOPE] prefix와 alternatives 포함", () => {
    const r = outOfScopeResponse("verify_pipa_citation", "비-PIPA 인용", ["search_law"]);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("[OUT_OF_SCOPE]");
    expect(r.content[0]?.text).toContain("verify_pipa_citation");
    expect(r.content[0]?.text).toContain("search_law");
  });
});

describe("notFoundScopeResponse", () => {
  it("[NOT_FOUND_SCOPE] prefix와 안내 포함", () => {
    const r = notFoundScopeResponse("PIPC 코퍼스", "민법 손해배상");
    expect(r.content[0]?.text).toContain("[NOT_FOUND_SCOPE]");
    expect(r.content[0]?.text).toContain("개인정보 분야만 다룹니다");
    expect(r.isError).toBeFalsy();
  });
});

describe("hallucinationDetectedResponse", () => {
  it("환각 검출 응답 — isError=true", () => {
    const r = hallucinationDetectedResponse("PIPA §9999", "조문 범위 §1~§76");
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("[HALLUCINATION_DETECTED]");
    expect(r.content[0]?.text).toContain("PIPA §9999");
  });
});
