import { describe, it, expect } from "vitest";
import { getSectoralRelatedLaws } from "../../../src/tools/hints/get-sectoral-related-laws.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";

const client = new LawApiClient({ apiKey: "unused-data-only" });

describe("get_sectoral_related_laws — 정의", () => {
  it("name·description", () => {
    expect(getSectoralRelatedLaws.name).toBe("get_sectoral_related_laws");
    expect(getSectoralRelatedLaws.description).toContain("PIPC 분야별");
    expect(getSectoralRelatedLaws.description).toContain("8개 분야");
  });

  it("스키마 — 모든 필드 옵셔널", () => {
    const parsed = getSectoralRelatedLaws.inputSchema.parse({});
    expect(parsed.include_additional).toBe(true);
  });
});

describe("get_sectoral_related_laws — sector 미지정 (8개 list)", () => {
  it("8개 분야 모두 표시", async () => {
    const r = await getSectoralRelatedLaws.handler({ include_additional: true }, client);
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    for (const s of ["인사·노무", "사회복지시설", "의료기관", "약국", "학원·교습소", "통계작성", "공공기관", "온라인경품"]) {
      expect(text).toContain(s);
    }
    expect(text).toContain("이어서 할 수 있는 조회");
  });
});

describe("get_sectoral_related_laws — sector 지정", () => {
  it("'의료기관' → 10개 official 법령", async () => {
    const r = await getSectoralRelatedLaws.handler(
      { sector: "의료기관", include_additional: true },
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("의료기관 분야");
    expect(text).toContain("의료법");
    expect(text).toContain("국민건강보험법");
    expect(text).toContain("PIPC 공식 분류 — 10개");
    expect(text).toContain("lex specialis 원칙");
    expect(text).toContain("특별법(의료법 등)");
    expect(text).toContain("⚠ 면책");
    expect(text).toContain("p.217");
  });

  it("include_additional=false → 본문 산재 미포함", async () => {
    const r = await getSectoralRelatedLaws.handler(
      { sector: "의료기관", include_additional: false },
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).not.toContain("본문 산재 인용");
    expect(text).not.toContain("의료법 시행규칙"); // 본문 산재
    expect(text).toContain("의료법"); // official엔 있음
  });

  it("'인사·노무' → 도입부+참고2 둘 다 등장한 8개 ⭐ 표시", async () => {
    const r = await getSectoralRelatedLaws.handler(
      { sector: "인사·노무", include_additional: true },
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("PIPC 두 번 강조");
    expect(text).toContain("Ⅰ.개요");
    expect(text).toContain("참고 2");
  });

  it("공공기관 편 — domain 태그 (감사·공직선거·수사·행정조사)", async () => {
    const r = await getSectoralRelatedLaws.handler(
      { sector: "공공기관", include_additional: true },
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[감사]");
    expect(text).toContain("[공직선거]");
    expect(text).toContain("[수사]");
    expect(text).toContain("[행정조사]");
    expect(text).toContain("감사원법");
    expect(text).toContain("형사소송법");
  });
});

describe("get_sectoral_related_laws — 별칭 정규화", () => {
  it("'병원' → '의료기관'", async () => {
    const r = await getSectoralRelatedLaws.handler({ sector: "병원" }, client);
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("의료기관 분야");
    expect(text).toContain('"병원" → "의료기관" 정규화');
  });

  it("'감사' → '공공기관'", async () => {
    const r = await getSectoralRelatedLaws.handler({ sector: "감사" }, client);
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text ?? "").toContain("공공기관 분야");
  });

  it("'인사' → '인사·노무'", async () => {
    const r = await getSectoralRelatedLaws.handler({ sector: "인사" }, client);
    expect(r.isError).toBeFalsy();
    expect(r.content[0]?.text ?? "").toContain("인사·노무 분야");
  });
});

describe("get_sectoral_related_laws — 분야 미수록", () => {
  it("'건설' → [NOT_FOUND_SCOPE] + 대체 도구 안내", async () => {
    const r = await getSectoralRelatedLaws.handler({ sector: "건설" }, client);
    // [NOT_FOUND_SCOPE]는 자연 0매칭 안내 (isError 미설정)
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[NOT_FOUND_SCOPE]");
    expect(text).toContain("search_law");
    expect(text).toContain("intelligent_law_search");
  });
});

describe("get_sectoral_related_laws — 편향 차단 baseline", () => {
  it("모든 sector 응답에 면책 + lex_specialis + 다음 도구 anchoring", async () => {
    for (const s of ["의료기관", "인사·노무", "공공기관", "통계작성"]) {
      const r = await getSectoralRelatedLaws.handler({ sector: s }, client);
      expect(r.isError).toBeFalsy();
      const text = r.content[0]?.text ?? "";
      expect(text, `${s} 면책`).toContain("⚠ 면책");
      expect(text, `${s} lex specialis`).toContain("lex specialis 원칙");
      expect(text, `${s} 추가 검토 안내`).toContain("추가 검토 필수");
      expect(text, `${s} search_law 권유`).toContain("search_law");
      expect(text, `${s} 출발점 명시`).toContain("출발점");
    }
  });
});
