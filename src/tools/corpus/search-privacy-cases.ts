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
      "검색 키워드 (예: '환자 동의', 'CCTV 화각', '직원 주민등록번호', '쿠키')"
    ),
  category1: z
    .string()
    .optional()
    .describe("처리자 분류 (예: '개인정보처리자(민간)', '정보주체(일반국민)', '공공기관')"),
  category2: z
    .string()
    .optional()
    .describe("처리행위 (예: '개인정보 수집·이용', '제3자 제공', '파기')"),
  category3: z
    .string()
    .optional()
    .describe("분야 (예: '보건·의료', '금융', '교육', '온라인')"),
  year_min: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .describe("최소 연도 YYYY (case_year 필터)"),
  year_max: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .describe("최대 연도 YYYY"),
  display: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(5)
    .describe("결과 개수 (기본 5, 최대 30)"),
});

const BODY_SNIPPET_CHARS = 350;

function clipBody(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "…";
}

function caseLine(idx: number, r: CorpusSearchResult): string {
  const c = r.chunk;
  let line = `\n[${idx + 1}] ${c.title ?? "(제목 없음)"}`;
  if (c.case_year) line += `  (${c.case_year})`;
  line += `\n     카테고리: ${c.category1 ?? "-"} > ${c.category2 ?? "-"} > ${c.category3 ?? "-"}`;
  if (c.chunk_context) line += `\n     · ${clipBody(c.chunk_context, 200)}`;
  line += `\n     ${clipBody(c.body, BODY_SNIPPET_CHARS)}`;
  line += `\n     ${formatPipcAttribution({
    doc_title: c.doc_title,
    source_url: c.source_url,
    ntt_id: c.ntt_id,
  })}`;
  return line;
}

export const searchPrivacyCases: Tool<typeof inputSchema> = {
  name: "search_privacy_cases",
  description:
    "PIPC privacy.go.kr 상담사례 1,745건 BM25 검색 (Contextual Retrieval 적용). " +
    "category1(처리자) × category2(처리행위) × category3(분야) 트리 필터 지원. " +
    "year_min/year_max로 연도 범위 좁히기. 법제처 API에 없는 PIPC 실무 회신이 차별화. " +
    "예: '의료기관 환자 동의' + category3='보건·의료' → 의료 도메인 사례. " +
    "응답에 PIPC attribution 자동 첨부 (pipc-attribution 라이선스). " +
    "다음: search_privacy_guides로 공식 가이드, search_pipc_decisions로 위반·과징금 의결.",
  inputSchema,

  async handler(args) {
    try {
      const opts: Parameters<typeof searchCorpus>[1] = {
        sourceType: "case",
        display: args.display,
      };
      if (args.category1) opts.category1 = args.category1;
      if (args.category2) opts.category2 = args.category2;
      if (args.category3) opts.category3 = args.category3;
      if (args.year_min) opts.yearMin = args.year_min;
      if (args.year_max) opts.yearMax = args.year_max;

      const results = searchCorpus(args.query, opts);

      if (results.length === 0) {
        return notFoundScopeResponse("PIPC 상담사례 코퍼스", args.query, [
          `search_privacy_corpus(query="${args.query}") — 가이드 포함 통합 검색`,
          `search_pipc_decisions(query="${args.query}") — PIPC 의결례 (위반 사례)`,
          `search_law(query="${args.query}") — 법제처 법령 검색`,
        ]);
      }

      let text = `상담사례 — "${args.query}"\n`;
      const filterTags: string[] = [];
      if (args.category1) filterTags.push(`처리자=${args.category1}`);
      if (args.category2) filterTags.push(`행위=${args.category2}`);
      if (args.category3) filterTags.push(`분야=${args.category3}`);
      if (args.year_min || args.year_max) {
        filterTags.push(`연도=${args.year_min ?? "-"}~${args.year_max ?? "-"}`);
      }
      if (filterTags.length) text += `필터: ${filterTags.join(" · ")}\n`;
      text += `상위 ${results.length}건\n`;

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r) text += caseLine(i, r);
      }

      const first = results[0]?.chunk;
      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [];
      if (first?.category3) {
        suggestions.push({
          tool: "search_privacy_cases",
          args: { query: args.query, category3: first.category3 },
          reason: `${first.category3} 분야 사례 좁혀 보기`,
        });
      }
      suggestions.push({
        tool: "search_privacy_guides",
        args: { query: args.query },
        reason: "공식 가이드에서 동일 주제 확인",
      });
      text = appendSuggestions(text, suggestions);

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_privacy_cases");
    }
  },
};
