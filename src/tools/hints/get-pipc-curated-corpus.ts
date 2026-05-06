import { z } from "zod";
import type { Tool } from "../types.js";
import { getDataIndex } from "../../lib/sectoral-laws-data.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";

const inputSchema = z.object({
  category: z
    .enum(["all", "law", "admrul"])
    .default("all")
    .describe("law=12개 법령 / admrul=23개 행정규칙 / all=전체 (기본 all)"),
});

export const getPipcCuratedCorpus: Tool<typeof inputSchema> = {
  name: "get_pipc_curated_corpus",
  description:
    "PIPC 공식 큐레이션 일반 도메인 출발점 (개인정보 포털 privacy.go.kr 직접 게시). " +
    "12개 법령 + 23개 행정규칙 — PIPC가 '개인정보 보호 관련'으로 직접 분류한 list. " +
    "분야별 안내서(8개 분야)와 별개의 *일반* 큐레이션. PIPA 도메인 첫 진입 시 권유. " +
    "** 우리 큐레이션 0 — PIPC가 portal에 게시한 list 그대로. ** " +
    "출처 URL 자동 첨부 (사용자 검증 가능). " +
    "다음: search_law(법령명)·search_admin_rule(고시명)으로 본문, get_sectoral_related_laws(sector)로 분야별 매핑.",
  inputSchema,

  async handler(args) {
    try {
      const idx = getDataIndex();
      const portal = idx.portal;

      let text = `=== ${portal.title} ===\n`;
      text += `\n📘 ${portal.note}\n\n`;

      if (args.category === "all" || args.category === "law") {
        text += `【 개인정보 보호 관련 법령 — 12개 】\n`;
        text += `📎 출처: ${portal.source_url_laws}\n\n`;
        for (let i = 0; i < portal.laws.length; i++) {
          const law = portal.laws[i];
          if (!law) continue;
          text += `  ${(i + 1).toString().padStart(2, " ")}. ${law.name}\n`;
          text += `      소관: ${law.ministry}\n`;
        }
      }

      if (args.category === "all") text += "\n";

      if (args.category === "all" || args.category === "admrul") {
        text += `【 개인정보 보호 관련 행정규칙 — ${portal.admrules.length}개 】\n`;
        text += `📎 출처: ${portal.source_url_admrules}\n\n`;
        for (let i = 0; i < portal.admrules.length; i++) {
          const r = portal.admrules[i];
          if (!r) continue;
          text += `  ${(i + 1).toString().padStart(2, " ")}. ${r.name}\n`;
          text += `      종류: ${r.law_kind}\n`;
        }
      }

      // 면책
      text += `\n⚠ 면책 (LLM 필독)\n`;
      text += `- 위 list는 PIPC가 개인정보 포털에 게시한 *공식 큐레이션* 그대로.\n`;
      text += `- PIPA 도메인 *일반* 출발점이며 *완전한* list는 아님 (PIPC가 의도적으로 추린 것).\n`;
      text += `- 분야별 (의료·복지·인사 등) 매핑은 get_sectoral_related_laws 사용.\n`;
      text += `- 그 외 적용 법령 검색은 search_law / intelligent_law_search.\n`;
      text += `- 최종 적용 법령 결정은 LLM·실무자 책임. 본 도구는 출발점일 뿐.\n`;

      // 다음 도구 anchoring
      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [
        {
          tool: "get_sectoral_related_laws",
          args: {},
          reason: "분야별(8개) PIPC 매핑 — 의료·복지·인사·약국·학원·통계·공공·온라인경품",
        },
        {
          tool: "search_law",
          args: { query: portal.laws[0]?.name ?? "개인정보 보호법" },
          reason: "특정 법령 정식 본문 조회",
        },
        {
          tool: "search_admin_rule",
          args: { query: "개인정보" },
          reason: "PIPC 고시·훈령 본문 검색",
        },
      ];
      text = appendSuggestions(text, suggestions);

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_pipc_curated_corpus");
    }
  },
};
