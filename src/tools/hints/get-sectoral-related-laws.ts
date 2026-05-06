import { z } from "zod";
import type { Tool } from "../types.js";
import {
  getDataIndex,
  resolveSectorName,
  getAvailableSectors,
  type SectorEntry,
} from "../../lib/sectoral-laws-data.js";
import { notFoundScopeResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";

const inputSchema = z.object({
  sector: z
    .string()
    .optional()
    .describe(
      "분야명. 미지정 시 PIPC 안내서 8개 분야 list 반환. " +
        "지정 시 해당 분야의 PIPC 공식 매핑 + 본문 산재 인용 빈도. " +
        "유효 값: '인사·노무', '사회복지시설', '의료기관', '약국', '학원·교습소', '통계작성', '공공기관', '온라인경품'. " +
        "별칭(인사/노무/병원/학원/감사/선거 등) 자동 정규화."
    ),
  include_additional: z
    .boolean()
    .default(true)
    .describe(
      "PIPC 공식 분류 표 외 본문 산재 인용 빈도 포함 여부 (기본 true). " +
        "false면 official_laws만."
    ),
});

const ADDITIONAL_LIMIT = 30;

function formatGuideMeta(s: SectorEntry): string {
  const g = s.guide;
  let text = `📘 출처: ${g.title} (${g.date})\n`;
  text += `   발행: ${g.publisher} · 소관: ${g.ministry}\n`;
  text += `   페이지 범위: ${g.page_range}\n`;
  return text;
}

function formatSector(s: SectorEntry, includeAdditional: boolean): string {
  let text = `=== ${s.scope} 분야 — PIPC 안내서 매핑 ===\n\n`;
  text += formatGuideMeta(s);

  text += `\n【 lex specialis 원칙 (PIPC 명시) 】\n`;
  text += `${s.lex_specialis}\n`;

  text += `\n【 PIPC 공식 분류 — ${s.official_laws.length}개 법령 】\n`;
  if (s.official_laws.length === 0) {
    text += `(PIPC 안내서에 정형 표 없음)\n`;
  } else {
    for (let i = 0; i < s.official_laws.length; i++) {
      const law = s.official_laws[i];
      if (!law) continue;
      const shortTag = law.short ? ` (${law.short})` : "";
      const domainTag = law.domain ? ` [${law.domain}]` : "";
      const kindTag = law.kind ? ` [${law.kind}]` : "";
      text += `  ${i + 1}. ${law.name}${shortTag}${domainTag}${kindTag}\n`;
      text += `     ${law.summary}\n`;
      const sourceLabels = law.sources
        .map((src) => `${src.label} (${src.page})`)
        .join(" + ");
      const star = law.sources.length >= 2 ? " ⭐ PIPC 두 번 강조" : "";
      text += `     출처: ${sourceLabels}${star}\n`;
    }
  }

  if (includeAdditional && s.additional_mentions.length > 0) {
    const shown = s.additional_mentions.slice(0, ADDITIONAL_LIMIT);
    text += `\n【 본문 산재 인용 ${s.additional_mentions.length}개 (참고) 】\n`;
    text += `※ PIPC 정형 분류 아님 — 안내서 본문에 자주 인용된 부속·관련 법령 (빈도 통계).\n`;
    for (const m of shown) {
      const kindTag = m.kind ? ` [${m.kind}]` : "";
      text += `  • (${m.mention_count}회) ${m.name}${kindTag}\n`;
    }
    if (s.additional_mentions.length > ADDITIONAL_LIMIT) {
      text += `  ⋯ ${s.additional_mentions.length - ADDITIONAL_LIMIT}개 더\n`;
    }
  }

  // 면책 — 편향 차단의 핵심
  text += `\n⚠ 면책 (LLM 필독)\n`;
  text += `- 위 매핑은 PIPC 분야별 안내서 ${s.guide.date} 기준. 신판 발간 시 변경 가능.\n`;
  text += `- additional_mentions는 PIPC 정형 분류가 아닌 빈도 통계 (참고용).\n`;
  text += `- 분야 외 결합 (예: ${s.scope} + 신용정보) 시 다른 분야·portal_corpus·search_law로 추가 검토 필수.\n`;
  text += `- 본 안내서 미수록 분야는 search_law·intelligent_law_search로 직접 탐색.\n`;
  text += `- 최종 적용 법령 결정은 LLM·실무자 책임. 본 도구는 출발점일 뿐.\n`;

  return text;
}

function formatSummary(): string {
  const idx = getDataIndex();
  let text = `=== PIPC 분야별 개인정보 보호 안내서 — 8개 분야 ===\n\n`;
  text += `📘 출처: 분야별 개인정보 보호 안내서 (개인정보보호위원회, 2024.12)\n`;
  text += `📊 분야별 entry 통계:\n\n`;
  for (const s of idx.sectors) {
    text += `  • ${s.scope.padEnd(10, " ")}  공식 ${s.official_laws.length
      .toString()
      .padStart(2, " ")}개 + 본문 산재 ${s.additional_mentions.length
      .toString()
      .padStart(2, " ")}개  ` +
      `(${s.guide.ministry})\n`;
  }
  text += `\n💡 특정 분야 lookup: get_sectoral_related_laws(sector="인사·노무") 등\n`;
  text += `\n⚠ 본 도구는 PIPC 분야별 안내서 8개 분야만 다룸. PIPA 도메인 일반 출발점은 ` +
    `get_pipc_curated_corpus(), 그 외 법령 검색은 search_law / intelligent_law_search.\n`;
  return text;
}

export const getSectoralRelatedLaws: Tool<typeof inputSchema> = {
  name: "get_sectoral_related_laws",
  description:
    "PIPC 분야별 개인정보 보호 안내서(2024.12) 매핑 lookup. " +
    "8개 분야(인사·노무·사회복지시설·의료기관·약국·학원·교습소·통계작성·공공기관·온라인경품)별로 " +
    "PIPC가 안내서 정형 표로 분류한 관련 법령 + lex specialis 원칙 + 본문 산재 인용 빈도 통계 반환. " +
    "** 우리 큐레이션 0 — PIPC 안내서 그대로 인덱스화. ** " +
    "응답에 페이지·출처 자동 첨부 (검증 가능). official_laws (공식 표, 권위) vs additional_mentions (빈도 통계, 참고) 분리. " +
    "** 본 도구는 출발점 ** — 분야 미수록·교차 도메인은 search_law·intelligent_law_search·get_pipc_curated_corpus로 추가 검토 필수. " +
    "별칭(인사/노무/병원/학원/감사/선거 등) 자동 정규화. " +
    "다음: search_law(법령명)으로 본문, search_privacy_guides(doc_type=sectoral)로 안내서 본문, get_pipc_curated_corpus()로 일반 도메인 매핑.",
  inputSchema,

  async handler(args) {
    try {
      // sector 미지정 → 8개 분야 list summary
      if (!args.sector) {
        let text = formatSummary();
        text = appendSuggestions(text, [
          {
            tool: "get_sectoral_related_laws",
            args: { sector: "의료기관" },
            reason: "특정 분야 PIPC 매핑 조회 (예: 의료기관)",
          },
          {
            tool: "get_pipc_curated_corpus",
            args: {},
            reason: "PIPA 도메인 일반 출발점 (12 법령 + 23 행정규칙)",
          },
        ]);
        return { content: [{ type: "text", text }] };
      }

      // sector 정규화
      const resolved = resolveSectorName(args.sector);
      if (!resolved) {
        return notFoundScopeResponse(
          "PIPC 분야별 안내서",
          args.sector,
          [
            `get_sectoral_related_laws() — 8개 분야 list 확인`,
            `사용 가능 분야: ${getAvailableSectors().join(", ")}`,
            `search_law(query="${args.sector}") — 일반 법령 검색`,
            `intelligent_law_search(query="${args.sector} 개인정보") — AI 의미검색`,
          ]
        );
      }

      const idx = getDataIndex();
      const entry = idx.bySectorName.get(resolved);
      if (!entry) {
        return notFoundScopeResponse(
          "PIPC 분야별 안내서",
          args.sector,
          [`get_sectoral_related_laws() — 8개 분야 list 확인`]
        );
      }

      let text = formatSector(entry, args.include_additional);
      const aliasNote =
        resolved !== args.sector ? ` (입력 "${args.sector}" → "${resolved}" 정규화)` : "";

      // 다음 도구 anchoring — 자율 검색 유도
      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [];

      // 첫 official_law를 search_law 예시로
      const firstOfficial = entry.official_laws[0];
      if (firstOfficial) {
        suggestions.push({
          tool: "search_law",
          args: { query: firstOfficial.name },
          reason: `${firstOfficial.name} 정식 본문 조회`,
        });
      }
      // 분야별 안내서 본문 검색
      suggestions.push({
        tool: "search_privacy_guides",
        args: { query: resolved, doc_type: "sectoral" },
        reason: `${resolved} 분야 안내서 본문 사례·해설 조회`,
      });
      // 다른 분야 list
      suggestions.push({
        tool: "get_sectoral_related_laws",
        args: {},
        reason: "다른 분야 매핑 조회 (8개 분야 list)",
      });
      // PIPC 일반 도메인
      suggestions.push({
        tool: "get_pipc_curated_corpus",
        args: {},
        reason: "PIPA 도메인 일반 출발점 (12 법령 + 23 행정규칙)",
      });

      text = appendSuggestions(text + (aliasNote ? `\n${aliasNote}` : ""), suggestions);

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_sectoral_related_laws");
    }
  },
};
