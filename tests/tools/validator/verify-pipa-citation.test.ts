import { describe, it, expect } from "vitest";
import { verifyPipaCitation } from "../../../src/tools/validator/verify-pipa-citation.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";
import { loadEnv } from "../../../src/lib/env.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("verify_pipa_citation — 정의", () => {
  it("name·description", () => {
    expect(verifyPipaCitation.name).toBe("verify_pipa_citation");
    expect(verifyPipaCitation.description).toContain("4계층");
    expect(verifyPipaCitation.description).toContain("HALLUCINATION_DETECTED");
  });

  it("스키마 — citation 필수", () => {
    expect(() => verifyPipaCitation.inputSchema.parse({})).toThrow();
  });

  it("as_of 8자리 검증", () => {
    expect(() =>
      verifyPipaCitation.inputSchema.parse({ citation: "x", as_of: "2024" })
    ).toThrow();
    expect(() =>
      verifyPipaCitation.inputSchema.parse({ citation: "x", as_of: "20190601" })
    ).not.toThrow();
  });
});

describe.skipIf(!hasApiKey)("verify_pipa_citation — 실 API 시나리오", () => {
  const client = new LawApiClient();

  it("✅ 'PIPA §15 ① 6호' → 4계층 모두 ✓", async () => {
    const r = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "PIPA §15 ① 6호" }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("✅ 인용 검증 성공");
    expect(text).toContain("법령 존재");
    expect(text).toContain("조문 존재");
    expect(text).toContain("제1항 존재");
    expect(text).toContain("제6호 존재");
  }, 30_000);

  it("✗ 'PIPA §9999' → [HALLUCINATION_DETECTED] (조문 없음)", async () => {
    const r = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "PIPA §9999" }),
      client
    );
    expect(r.isError).toBe(true);
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[HALLUCINATION_DETECTED]");
    expect(text).toContain("조문 없음");
    expect(text).toContain("get_law_text"); // 다음 도구 안내
  }, 30_000);

  it("✗ 'PIPA §15 ⑩' → 항 없음", async () => {
    // PIPA §15는 ① ② ③ 3개 항만 있음
    const r = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "PIPA §15 ⑩" }),
      client
    );
    expect(r.isError).toBe(true);
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[HALLUCINATION_DETECTED]");
    expect(text).toContain("제10항 없음");
  }, 30_000);

  it("✗ 'PIPA §15 ① 99호' → 호 없음", async () => {
    const r = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "PIPA §15 ① 99호" }),
      client
    );
    expect(r.isError).toBe(true);
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[HALLUCINATION_DETECTED]");
    expect(text).toContain("제99호 없음");
  }, 30_000);

  it("✅ '개인정보 보호법 제28조의2' (가지번호)", async () => {
    const r = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({
        citation: "개인정보 보호법 제28조의2",
      }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("✅ 인용 검증 성공");
    expect(text).toContain("제28조의2");
  }, 30_000);

  it("✗ '없는 법명 §15' → 법령 자체 없음", async () => {
    const r = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({
        citation: "xyzqwerexistencequery 제15조",
      }),
      client
    );
    expect(r.isError).toBe(true);
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("[HALLUCINATION_DETECTED]");
    expect(text).toContain("법령 없음");
  }, 30_000);

  it("✗ 삭제된 조문 — '정통망법 §22' (2020.2.4 삭제) → [HALLUCINATION_DETECTED]", async () => {
    const client = new LawApiClient();
    const result = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "정통망법 §22" }),
      client
    );
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("[HALLUCINATION_DETECTED]");
    expect(text).toMatch(/조문 폐지|삭제/);
  }, 30_000);

  it("✗ 시점 검증 — '정통망법 §22' as_of=20240101 → 삭제됨", async () => {
    const client = new LawApiClient();
    const result = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({
        citation: "정통망법 §22",
        as_of: "20240101",
      }),
      client
    );
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("[HALLUCINATION_DETECTED]");
  }, 30_000);

  it("✅ 약칭 정규화 — '개보법 제15조' → 개인정보 보호법", async () => {
    const r = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "개보법 제15조" }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("개인정보 보호법");
    expect(text).toContain("✅ 인용 검증 성공");
  }, 30_000);

  it("응답 baseline — 정확한 mst·lawId 노출 + 출처 첨부 (성공 시)", async () => {
    const r = await verifyPipaCitation.handler(
      verifyPipaCitation.inputSchema.parse({ citation: "PIPA §15" }),
      client
    );
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toMatch(/mst=\d+/);
    expect(text).toMatch(/lawId=\d+/);
    expect(text).toContain("📎 출처:");
  }, 30_000);
});
