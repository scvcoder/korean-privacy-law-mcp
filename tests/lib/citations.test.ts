import { describe, it, expect } from "vitest";
import {
  parseCircledNumber,
  parseJoCode,
  formatJoCode,
  extractCitations,
} from "../../src/lib/citations.js";

describe("parseCircledNumber", () => {
  it("원숫자 ① ~ ⑳ 파싱", () => {
    expect(parseCircledNumber("①")).toBe(1);
    expect(parseCircledNumber("⑤")).toBe(5);
    expect(parseCircledNumber("⑳")).toBe(20);
  });

  it("ASCII 숫자 fallback", () => {
    expect(parseCircledNumber("1")).toBe(1);
    expect(parseCircledNumber("제15항")).toBe(15);
  });

  it("매칭 없으면 null", () => {
    expect(parseCircledNumber("abc")).toBeNull();
    expect(parseCircledNumber("")).toBeNull();
  });

  it("법제처 quirk — ① 뒤 공백", () => {
    expect(parseCircledNumber("① ")).toBe(1);
  });
});

describe("parseJoCode", () => {
  it("기본 — 제15조", () => {
    const c = parseJoCode("제15조");
    expect(c).toEqual({ jo: 15 });
  });

  it("조의N — 제24조의2", () => {
    const c = parseJoCode("제24조의2");
    expect(c).toEqual({ jo: 24, jo_branch: 2 });
  });

  it("전체 — 제15조제1항제2호가목", () => {
    const c = parseJoCode("제15조제1항제2호가목");
    expect(c).toEqual({ jo: 15, hang: 1, ho: 2, mok: "가" });
  });

  it("공백 무시", () => {
    const c = parseJoCode("제 15 조 제 1 항");
    expect(c).toEqual({ jo: 15, hang: 1 });
  });

  it("매칭 없으면 null", () => {
    expect(parseJoCode("abc")).toBeNull();
  });
});

describe("formatJoCode", () => {
  it("정규형 역포맷", () => {
    expect(formatJoCode({ jo: 15, hang: 1 })).toBe("제15조제1항");
    expect(formatJoCode({ jo: 24, jo_branch: 2 })).toBe("제24조의2");
    expect(formatJoCode({ jo: 15, hang: 1, ho: 2, mok: "가" })).toBe("제15조제1항제2호가목");
  });
});

describe("extractCitations — 30자 lookback", () => {
  it("known law name 매칭", () => {
    const text = "이는 개인정보 보호법 제15조 제1항에 따라 처리됩니다.";
    const cites = extractCitations(text, ["개인정보 보호법"]);
    expect(cites).toHaveLength(1);
    expect(cites[0]?.lawName).toBe("개인정보 보호법");
    expect(cites[0]?.article).toBe("제15조제1항");
    expect(cites[0]?.joCode).toEqual({ jo: 15, hang: 1 });
  });

  it("긴 이름 우선 매칭 (정통망법 < 정보통신망법)", () => {
    const text = "정보통신망법 제22조의 적용";
    const cites = extractCitations(text, ["정통망법", "정보통신망법"]);
    expect(cites[0]?.lawName).toBe("정보통신망법");
  });

  it("일반 패턴 fallback — '○○법' 형태", () => {
    const text = "민법 제750조에 따른 손해배상";
    const cites = extractCitations(text, []);
    expect(cites).toHaveLength(1);
    expect(cites[0]?.lawName).toContain("민법");
  });

  it("법령명이 없으면 인용 추출 안 함", () => {
    const text = "그냥 제15조의 의미는 다음과 같다.";
    const cites = extractCitations(text, ["개인정보 보호법"]);
    expect(cites).toHaveLength(0);
  });

  it("복수 인용 추출", () => {
    const text = "개인정보 보호법 제15조와 의료법 제21조 결합 적용";
    const cites = extractCitations(text, ["개인정보 보호법", "의료법"]);
    expect(cites).toHaveLength(2);
    expect(cites[0]?.lawName).toBe("개인정보 보호법");
    expect(cites[1]?.lawName).toBe("의료법");
  });
});
