import { describe, it, expect } from "vitest";
import {
  normalizeCitationText,
  parseCitation,
} from "../../src/lib/citations.js";

describe("normalizeCitationText", () => {
  it("§ → 제N조", () => {
    expect(normalizeCitationText("PIPA §15")).toBe("PIPA 제15조");
    expect(normalizeCitationText("§ 22")).toBe("제22조");
  });

  it("§의 분기 → 제N조의M", () => {
    expect(normalizeCitationText("§28의2")).toBe("제28조의2");
  });

  it("원숫자 → 제N항", () => {
    expect(normalizeCitationText("§15 ①")).toBe("제15조 제1항");
    expect(normalizeCitationText("②")).toBe("제2항");
    expect(normalizeCitationText("⑩")).toBe("제10항");
  });

  it("N호 → 제N호", () => {
    expect(normalizeCitationText("§15 ① 6호")).toBe("제15조 제1항 제6호");
    expect(normalizeCitationText("제3호")).toBe("제3호"); // 이미 제 있으면 그대로
  });

  it("「」 괄호 제거", () => {
    expect(normalizeCitationText("「개인정보 보호법」 §15")).toBe(
      "개인정보 보호법 제15조"
    );
  });
});

describe("parseCitation", () => {
  it("'PIPA §15' → law=PIPA, jo=15", () => {
    const r = parseCitation("PIPA §15");
    expect(r).not.toBeNull();
    expect(r?.lawName).toBe("PIPA");
    expect(r?.joCode.jo).toBe(15);
  });

  it("'PIPA §15 ① 6호' → 항·호 모두 추출", () => {
    const r = parseCitation("PIPA §15 ① 6호");
    expect(r?.joCode).toEqual({ jo: 15, hang: 1, ho: 6 });
  });

  it("'개인정보 보호법 제15조제1항제6호' 정식명 그대로", () => {
    const r = parseCitation("개인정보 보호법 제15조제1항제6호");
    expect(r?.lawName).toBe("개인정보 보호법");
    expect(r?.joCode).toEqual({ jo: 15, hang: 1, ho: 6 });
  });

  it("가지번호 — '제28조의2'", () => {
    const r = parseCitation("개인정보 보호법 제28조의2");
    expect(r?.joCode).toEqual({ jo: 28, jo_branch: 2 });
  });

  it("괄호 법령명 — '「○○법」 §22'", () => {
    const r = parseCitation("「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 §22");
    expect(r?.lawName).toBe("정보통신망 이용촉진 및 정보보호 등에 관한 법률");
    expect(r?.joCode.jo).toBe(22);
  });

  it("정통망법 약칭", () => {
    const r = parseCitation("정통망법 §22");
    expect(r?.lawName).toBe("정통망법");
    expect(r?.joCode.jo).toBe(22);
  });

  it("파싱 실패 — null", () => {
    expect(parseCitation("xyz")).toBeNull();
    expect(parseCitation("")).toBeNull();
    expect(parseCitation("그냥 한 줄")).toBeNull();
  });
});
