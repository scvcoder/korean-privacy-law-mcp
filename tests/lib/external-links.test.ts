import { describe, it, expect } from "vitest";
import {
  lawDetailUrl,
  lawArticleUrl,
  precedentUrl,
  pipcDecisionUrl,
  privacyCaseUrl,
  formatLawAttribution,
  formatPipcAttribution,
} from "../../src/lib/external-links.js";

describe("URL 생성기", () => {
  it("lawDetailUrl: lsId 포함", () => {
    expect(lawDetailUrl("12345")).toContain("lsId=12345");
  });

  it("lawArticleUrl: 한글 법령명 인코딩", () => {
    const url = lawArticleUrl("개인정보 보호법", "제15조");
    expect(url).toContain("law.go.kr");
    expect(url).toContain("%EA%B0%9C"); // 개 첫바이트
    expect(url).toContain("%EC%A0%9C15%EC%A1%B0"); // 제15조
  });

  it("precedentUrl·pipcDecisionUrl·privacyCaseUrl 기본 동작", () => {
    expect(precedentUrl("123")).toContain("precSeq=123");
    expect(pipcDecisionUrl("456")).toContain("ppcSeq=456");
    expect(privacyCaseUrl("789")).toContain("nttId=789");
    expect(privacyCaseUrl("789")).toContain("nttNo=1");
  });
});

describe("formatLawAttribution", () => {
  it("법령명 + 조문 + URL", () => {
    const out = formatLawAttribution("개인정보 보호법", "제15조");
    expect(out).toContain("📎 출처: 개인정보 보호법 제15조");
    expect(out).toContain("law.go.kr");
  });
});

describe("formatPipcAttribution", () => {
  it("상담사례 — ntt_id로 URL 생성", () => {
    const out = formatPipcAttribution({
      doc_title: "개인정보포털 상담사례",
      ntt_id: "1",
    });
    expect(out).toContain("개인정보보호위원회");
    expect(out).toContain("「개인정보포털 상담사례」");
    expect(out).toContain("nttId=1");
  });

  it("가이드 — pages 포함", () => {
    const out = formatPipcAttribution({
      doc_title: "개인정보 질의응답 모음집",
      source_pdf: "1. 개인정보 질의응답 모음집(2025.12.).pdf",
      pages: "p.3",
    });
    expect(out).toContain("p.3");
    expect(out).toContain("PDF:");
  });

  it("source_url 우선 사용", () => {
    const out = formatPipcAttribution({
      doc_title: "x",
      source_url: "https://example.com/doc",
      ntt_id: "1",
    });
    expect(out).toContain("https://example.com/doc");
    expect(out).not.toContain("nttId=1");
  });
});
