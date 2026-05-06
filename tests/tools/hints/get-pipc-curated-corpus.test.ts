import { describe, it, expect } from "vitest";
import { getPipcCuratedCorpus } from "../../../src/tools/hints/get-pipc-curated-corpus.js";
import { LawApiClient } from "../../../src/client/law-api-client.js";

const client = new LawApiClient({ apiKey: "unused-data-only" });

describe("get_pipc_curated_corpus — 정의", () => {
  it("name·description", () => {
    expect(getPipcCuratedCorpus.name).toBe("get_pipc_curated_corpus");
    expect(getPipcCuratedCorpus.description).toContain("12개 법령");
    expect(getPipcCuratedCorpus.description).toContain("23개 행정규칙");
  });

  it("category enum 검증", () => {
    expect(() =>
      getPipcCuratedCorpus.inputSchema.parse({ category: "invalid" })
    ).toThrow();
    for (const c of ["all", "law", "admrul"]) {
      expect(() =>
        getPipcCuratedCorpus.inputSchema.parse({ category: c })
      ).not.toThrow();
    }
  });

  it("기본 category=all", () => {
    expect(getPipcCuratedCorpus.inputSchema.parse({}).category).toBe("all");
  });
});

describe("get_pipc_curated_corpus — category 필터", () => {
  it("category=all → 12 법령 + 23 행정규칙 모두", async () => {
    const r = await getPipcCuratedCorpus.handler({ category: "all" }, client);
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("개인정보 보호 관련 법령 — 12개");
    expect(text).toContain("개인정보 보호 관련 행정규칙 — 23개");
    expect(text).toContain("개인정보 보호법");
    expect(text).toContain("신용정보의 이용 및 보호");
    expect(text).toContain("개인정보의 안전성 확보조치 기준");
  });

  it("category=law → 12 법령만", async () => {
    const r = await getPipcCuratedCorpus.handler({ category: "law" }, client);
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("개인정보 보호 관련 법령 — 12개");
    expect(text).not.toContain("개인정보 보호 관련 행정규칙");
  });

  it("category=admrul → 23 행정규칙만", async () => {
    const r = await getPipcCuratedCorpus.handler({ category: "admrul" }, client);
    expect(r.isError).toBeFalsy();
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("개인정보 보호 관련 행정규칙 — 23개");
    expect(text).not.toContain("개인정보 보호 관련 법령 — 12개");
  });

  it("출처 URL 첨부 (사용자 검증 가능)", async () => {
    const r = await getPipcCuratedCorpus.handler({ category: "all" }, client);
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("contsNo=116");
    expect(text).toContain("contsNo=117");
  });
});

describe("get_pipc_curated_corpus — 편향 차단 baseline", () => {
  it("면책 + 다음 도구 anchoring", async () => {
    const r = await getPipcCuratedCorpus.handler({ category: "all" }, client);
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("⚠ 면책");
    expect(text).toContain("완전한");
    expect(text).toContain("출발점일 뿐");
    expect(text).toContain("get_sectoral_related_laws");
    expect(text).toContain("search_law");
  });
});
