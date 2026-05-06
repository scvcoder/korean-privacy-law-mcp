import { describe, it, expect } from "vitest";
import { compactBody } from "../../src/lib/compact.js";

describe("compactBody", () => {
  it("짧은 본문은 그대로 (minLength 미만)", () => {
    const text = "짧은 본문입니다.";
    expect(compactBody(text)).toBe(text);
  });

  it("긴 본문은 head + 중략 + tail로 축약", () => {
    const head = "사건의 경위는 다음과 같다. ".repeat(80); // 약 1600자
    const tail = "결론적으로 이는 위법한 처리에 해당한다. ".repeat(40); // 약 1000자
    const text = head + tail;
    const out = compactBody(text);
    expect(out.length).toBeLessThan(text.length);
    expect(out).toContain("⋯ 중략");
    expect(out).toContain("자 (full=true로 전문 조회) ⋯");
  });

  it("토큰 절감 — 50% 이상 (긴 의결문 시뮬)", () => {
    const text = "신청인의 주장에 대하여 살펴보면 다음과 같다. ".repeat(200); // 약 8000자
    const out = compactBody(text);
    expect(out.length).toBeLessThan(text.length * 0.5);
  });

  it("options로 head/tail 길이 조정", () => {
    const text = "ABCDE".repeat(500); // 2500자
    const out = compactBody(text, { headLimit: 100, tailLimit: 50, minLength: 200 });
    // head + middle marker + tail < 원본
    expect(out.length).toBeLessThan(text.length);
    expect(out).toContain("중략");
  });

  it("head + tail이 본문보다 길면 원본 반환", () => {
    const text = "짧은텍스트".repeat(100); // 500자
    const out = compactBody(text, { headLimit: 1000, tailLimit: 1000, minLength: 100 });
    expect(out).toBe(text);
  });
});
