import { describe, it, expect } from "vitest";
import { formatSuggestions, appendSuggestions } from "../../src/lib/suggestions.js";

describe("formatSuggestions", () => {
  it("빈 배열은 빈 문자열", () => {
    expect(formatSuggestions([])).toBe("");
  });

  it("도구·인자·이유 포맷팅", () => {
    const out = formatSuggestions([
      { tool: "get_law_text", args: { law: "개인정보 보호법", article: "제15조" }, reason: "본문 확인" },
    ]);
    expect(out).toContain("이어서 할 수 있는 조회");
    expect(out).toContain("get_law_text(");
    expect(out).toContain('law="개인정보 보호법"');
    expect(out).toContain('article="제15조"');
    expect(out).toContain("본문 확인");
  });

  it("인자 없는 도구도 처리", () => {
    const out = formatSuggestions([{ tool: "get_pipc_curated_corpus", reason: "PIPC 출발점" }]);
    expect(out).toContain("get_pipc_curated_corpus()");
  });
});

describe("appendSuggestions", () => {
  it("기존 텍스트에 suggestions 첨부", () => {
    const out = appendSuggestions("응답 본문", [
      { tool: "search_law", args: { query: "x" }, reason: "확장" },
    ]);
    expect(out.startsWith("응답 본문")).toBe(true);
    expect(out).toContain("이어서 할 수 있는 조회");
  });

  it("빈 배열이면 본문만 반환", () => {
    expect(appendSuggestions("body", [])).toBe("body");
  });
});
