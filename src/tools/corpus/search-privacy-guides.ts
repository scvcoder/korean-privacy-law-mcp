import { z } from "zod";
import type { Tool } from "../types.js";
import {
  searchCorpus,
  DOC_TYPE_ALIAS,
  type CorpusSearchResult,
} from "../../lib/corpus-index.js";
import { notFoundScopeResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatPipcAttribution } from "../../lib/external-links.js";

const DOC_TYPES = ["qa", "small_business", "cctv", "sectoral", "all"] as const;

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "검색 키워드 (예: '가명정보 결합', 'CCTV 화각', '소상공인 동의', '의료기관 적용')"
    ),
  doc_type: z
    .enum(DOC_TYPES)
    .default("all")
    .describe(
      "가이드 종류 — qa(질의응답 99청크) / small_business(소상공인 41) / cctv(CCTV 안내서 71) / sectoral(분야별 안내서 476, 8개 편 전체) / all(전체 4종 687)"
    ),
  display: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(5)
    .describe("결과 개수 (기본 5, 최대 30)"),
});

const BODY_SNIPPET_CHARS = 400;

function clipBody(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "…";
}

function guideLine(idx: number, r: CorpusSearchResult): string {
  const c = r.chunk;
  let line = `\n[${idx + 1}] ${c.doc_title}`;
  if (c.pages) line += ` (${c.pages})`;
  line += `\n     §${c.section}`;
  if (c.chunk_context) line += `\n     · ${clipBody(c.chunk_context, 220)}`;
  line += `\n     ${clipBody(c.body, BODY_SNIPPET_CHARS)}`;
  line += `\n     ${formatPipcAttribution({
    doc_title: c.doc_title,
    source_url: c.source_url,
    source_pdf: c.source_pdf,
    pages: c.pages,
  })}`;
  return line;
}

export const searchPrivacyGuides: Tool<typeof inputSchema> = {
  name: "search_privacy_guides",
  description:
    "PIPC 공식 가이드 4종 BM25 검색 (Contextual Retrieval, 총 687청크). " +
    "doc_type ∈ {qa, small_business, cctv, sectoral, all}. " +
    "qa=질의응답 모음집(2025.12, 99) / small_business=소상공인 핸드북(2024.12, 41) / cctv=고정형 영상정보처리기기 안내서(2024.12, 71) / sectoral=분야별 안내서(2024.12, 476, 8개 편 전체: 인사노무·사회복지시설·의료기관·약국·학원교습소·통계작성·공공기관·온라인경품). " +
    "법제처 API가 못 가진 PIPC 실무 안내가 차별화. " +
    "응답에 PIPC attribution + 페이지 정보 자동 첨부 (pipc-attribution 라이선스). " +
    "다음: search_privacy_cases로 실제 상담 사례, search_law로 관련 법조문.",
  inputSchema,

  async handler(args) {
    try {
      const opts: Parameters<typeof searchCorpus>[1] = {
        sourceType: "guide",
        display: args.display,
      };
      if (args.doc_type !== "all") {
        const docId = DOC_TYPE_ALIAS[args.doc_type];
        if (docId) opts.docId = docId;
      }

      const results = searchCorpus(args.query, opts);

      if (results.length === 0) {
        return notFoundScopeResponse("PIPC 가이드 코퍼스", args.query, [
          `search_privacy_corpus(query="${args.query}") — 사례 포함 통합 검색`,
          `search_privacy_cases(query="${args.query}") — 상담사례만`,
          `search_law(query="${args.query}") — 법제처 법령 검색`,
        ]);
      }

      let text = `PIPC 가이드 — "${args.query}"`;
      if (args.doc_type !== "all") text += `  [${args.doc_type}]`;
      text += `\n상위 ${results.length}건\n`;

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r) text += guideLine(i, r);
      }

      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [];
      const first = results[0]?.chunk;
      if (first && args.doc_type === "all") {
        // 첫 결과의 doc_type 알리아스 역추적
        const alias = Object.entries(DOC_TYPE_ALIAS).find(
          ([, docId]) => docId === first.doc_id
        )?.[0];
        if (alias) {
          suggestions.push({
            tool: "search_privacy_guides",
            args: { query: args.query, doc_type: alias },
            reason: `${first.doc_title} 단독 검색`,
          });
        }
      }
      suggestions.push({
        tool: "search_privacy_cases",
        args: { query: args.query },
        reason: "동일 주제 상담사례 확인",
      });
      text = appendSuggestions(text, suggestions);

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_privacy_guides");
    }
  },
};
