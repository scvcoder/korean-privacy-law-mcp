import { describe, it, expect } from "vitest";
import { resolveLawAlias, getAllKnownLawNames, PRIVACY_ALIASES } from "../../src/lib/aliases.js";

describe("resolveLawAlias", () => {
  it("개보법 → 개인정보 보호법", () => {
    expect(resolveLawAlias("개보법")).toBe("개인정보 보호법");
  });

  it("정통망법 → 정보통신망 이용촉진 및 정보보호 등에 관한 법률", () => {
    expect(resolveLawAlias("정통망법")).toBe(
      "정보통신망 이용촉진 및 정보보호 등에 관한 법률"
    );
  });

  it("신정법 → 신용정보의 이용 및 보호에 관한 법률", () => {
    expect(resolveLawAlias("신정법")).toBe("신용정보의 이용 및 보호에 관한 법률");
  });

  it("위정법 → 위치정보의 보호 및 이용 등에 관한 법률", () => {
    expect(resolveLawAlias("위정법")).toBe(
      "위치정보의 보호 및 이용 등에 관한 법률"
    );
  });

  it("정식 명칭은 그대로", () => {
    expect(resolveLawAlias("개인정보 보호법")).toBe("개인정보 보호법");
  });

  it("알 수 없는 법령은 입력 그대로", () => {
    expect(resolveLawAlias("외계인법")).toBe("외계인법");
  });

  it("앞뒤 공백 처리", () => {
    expect(resolveLawAlias("  개보법  ")).toBe("개인정보 보호법");
  });
});

describe("getAllKnownLawNames", () => {
  it("정식 명칭과 모든 약칭 포함", () => {
    const names = getAllKnownLawNames();
    expect(names).toContain("개인정보 보호법");
    expect(names).toContain("개보법");
    expect(names).toContain("정보통신망 이용촉진 및 정보보호 등에 관한 법률");
    expect(names).toContain("정통망법");
  });

  it("중복 없음", () => {
    const names = getAllKnownLawNames();
    expect(names.length).toBe(new Set(names).size);
  });
});

describe("PRIVACY_ALIASES 데이터 무결성", () => {
  it("PIPC 공식 12 결합법령 모두 포함", () => {
    const canonicals = PRIVACY_ALIASES.map((e) => e.canonical);
    const required = [
      "개인정보 보호법",
      "개인정보 보호법 시행령",
      "신용정보의 이용 및 보호에 관한 법률",
      "공공기관의 운영에 관한 법률",
      "지방공기업법",
      "초·중등교육법",
      "고등교육법",
      "주민등록법",
      "전자정부법",
      "전자서명법",
      "공공기관의 정보공개에 관한 법률",
      "국가인권위원회법",
    ];
    for (const law of required) {
      expect(canonicals).toContain(law);
    }
  });

  it("Tier 4 — 정보통신망법 포함 (흡수 추적용)", () => {
    const canonicals = PRIVACY_ALIASES.map((e) => e.canonical);
    expect(canonicals).toContain("정보통신망 이용촉진 및 정보보호 등에 관한 법률");
  });
});
