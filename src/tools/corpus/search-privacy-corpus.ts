import { z } from "zod";
import type { Tool } from "../types.js";
import {
  searchCorpus,
  type CorpusSearchResult,
} from "../../lib/corpus-index.js";
import { notFoundScopeResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatPipcAttribution } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "검색 키워드 (PIPA 도메인 — 예: '의료기관 환자 동의', 'CCTV 설치', '가명정보 결합', '직원 이력서')"
    ),
  display: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(5)
    .describe("결과 개수 (기본 5, 최대 30)"),
  source_type: z
    .enum(["guide", "case", "all"])
    .default("all")
    .describe("guide=PIPC 공식 안내서 / case=privacy.go.kr 상담사례 / all=둘 다"),
});

const BODY_SNIPPET_CHARS = 300;

function clipBody(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "…";
}

function chunkLine(idx: number, r: CorpusSearchResult): string {
  const c = r.chunk;
  const tag = c.source_type === "case" ? "💬 상담사례" : "📘 가이드";
  let line = `\n[${idx + 1}] ${tag} · ${c.doc_title}`;
  if (c.case_year) line += ` (${c.case_year})`;
  line += `\n     ${c.section}`;
  if (c.chunk_context) {
    line += `\n     · ${clipBody(c.chunk_context, 200)}`;
  }
  line += `\n     ${clipBody(c.body, BODY_SNIPPET_CHARS)}`;
  // PIPC attribution
  line += `\n     ${formatPipcAttribution({
    doc_title: c.doc_title,
    source_url: c.source_url,
    source_pdf: c.source_pdf,
    pages: c.pages,
    ntt_id: c.ntt_id,
  })}`;
  return line;
}

export const searchPrivacyCorpus: Tool<typeof inputSchema> = {
  name: "search_privacy_corpus",
  description:
    "PIPC 공식 가이드 4종(질의응답·소상공인·CCTV·분야별 안내서 8개 편 전체) + privacy.go.kr 상담사례 1,745건 통합 BM25 검색 (총 2,432 청크, Contextual Retrieval 적용). " +
    "법제처 API가 못 가진 PIPC 실무 자료가 차별화 — 정의 사례·상담 회신·업종별 적용 안내. " +
    "LLM 첫 진입에 가장 자연스러운 도구. source_type=guide/case로 분리 검색도 가능. " +
    "응답에 PIPC attribution 자동 첨부 (pipc-attribution 라이선스). " +
    "다음: 더 좁은 검색은 search_privacy_cases·search_privacy_guides, 법조문은 search_law·get_law_text.",
  inputSchema,

  async handler(args) {
    try {
      const opts: { sourceType?: "guide" | "case"; display: number } = {
        display: args.display,
      };
      if (args.source_type === "guide") opts.sourceType = "guide";
      else if (args.source_type === "case") opts.sourceType = "case";

      const results = searchCorpus(args.query, opts);

      if (results.length === 0) {
        return notFoundScopeResponse("PIPC 코퍼스", args.query, [
          `search_law(query="${args.query}") — 법제처 법령 검색`,
          `intelligent_law_search(query="${args.query}") — AI 의미검색`,
          `search_pipc_decisions(query="${args.query}") — PIPC 의결례`,
        ]);
      }

      const guideHits = results.filter((r) => r.chunk.source_type === "guide").length;
      const caseHits = results.filter((r) => r.chunk.source_type === "case").length;

      let text = `PIPC 코퍼스 검색 — "${args.query}"\n`;
      text += `상위 ${results.length}건 (가이드 ${guideHits} · 상담사례 ${caseHits})\n`;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r) text += chunkLine(i, r);
      }

      // 첫 결과 기반 다음 도구 추천
      const first = results[0]?.chunk;
      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [];
      if (first?.source_type === "case") {
        suggestions.push({
          tool: "search_privacy_cases",
          args: {
            query: args.query,
            ...(first.category3 ? { category3: first.category3 } : {}),
          },
          reason: "유사 카테고리 사례 더 보기",
        });
      } else if (first?.source_type === "guide") {
        suggestions.push({
          tool: "search_privacy_guides",
          args: { query: args.query },
          reason: "공식 가이드 더 보기",
        });
      }
      suggestions.push({
        tool: "search_law",
        args: { query: args.query },
        reason: "관련 법조문 검색",
      });
      text = appendSuggestions(text, suggestions);

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_privacy_corpus");
    }
  },
};
