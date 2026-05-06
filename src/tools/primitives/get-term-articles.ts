import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, extractTagAll } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "법령용어명 (예: '개인정보', '가명정보', '고유식별정보'). 정확한 용어명 매칭."
    ),
  maxArticles: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("용어 그룹별 표시할 최대 연계 조문 수 (기본 20). 응답 절단 한도."),
  includeBody: z
    .boolean()
    .default(true)
    .describe("조문 본문 미리보기(200자) 포함 여부 (기본 true)."),
});

const PREVIEW_CHARS = 200;

interface LinkedArticle {
  법령명: string;
  조번호: string;
  조가지번호: string;
  조문내용: string;
  용어구분: string;
  /** 조문연계용어링크에서 추출한 lawId (6자리) */
  lawId: string;
  /** JO 6자리 코드 (조4 + 가지2) */
  joCode: string;
}

interface TermGroup {
  법령용어명: string;
  연계법령: LinkedArticle[];
}

/** 조문연계용어링크 URL에서 ID·JO 파싱. */
function parseLinkParams(linkUrl: string): { lawId: string; joCode: string } {
  const lawIdMatch = linkUrl.match(/[?&]ID=([^&]+)/);
  const joMatch = linkUrl.match(/[?&]JO=([^&]+)/);
  return {
    lawId: lawIdMatch?.[1] ?? "",
    joCode: joMatch?.[1] ?? "",
  };
}

function articleNumber(조번호: string, 조가지번호: string): string {
  const main = parseInt(조번호, 10) || 0;
  const branch = parseInt(조가지번호, 10) || 0;
  return branch > 0 ? `제${main}조의${branch}` : `제${main}조`;
}

function clip(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "…";
}

export const getTermArticles: Tool<typeof inputSchema> = {
  name: "get_term_articles",
  description:
    "법령용어가 사용된 조문 추적 (법제처 lawService · target=lstrmRltJo). " +
    "법령용어 키워드 → 매칭 용어 그룹별로 그 용어가 등장하는 모든 조문 목록 반환. " +
    "예: '개인정보' → PIPA·정보통신망법·신용정보법 등 ~700개 조문 (상위 N건). " +
    "동음이의 용어는 별도 그룹으로 분리. 페이징 X — maxArticles로 절단. " +
    "다음: get_law_text(lawId=...)로 해당 조문 전문, get_legal_term(query)로 정의 확인.",
  inputSchema,

  async handler(args, client) {
    try {
      const xml = await client.fetchApi({
        endpoint: "lawService.do",
        target: "lstrmRltJo",
        type: "XML",
        extraParams: { query: args.query },
      });

      // rootTag: <lstrmRltJoService>
      const service = extractTag(xml, "lstrmRltJoService") || xml;
      const totalCnt = parseInt(extractTag(service, "검색결과개수"), 10) || 0;

      if (totalCnt === 0) {
        return notFoundResponse(`법령용어-조문 연계 결과 없음: "${args.query}"`, [
          `get_legal_term(query="${args.query}") — 정의·동음이의 확인`,
          `intelligent_law_search(query="${args.query}") — 의미검색`,
        ]);
      }

      // <법령용어> 그룹 추출 — 동음이의 가능
      const groupXmls = extractTagAll(service, "법령용어");
      const groups: TermGroup[] = [];

      for (const groupXml of groupXmls) {
        const 법령용어명 = extractTag(groupXml, "법령용어명");
        const 연계XmlAll = extractTagAll(groupXml, "연계법령");

        const 연계법령: LinkedArticle[] = [];
        for (const linkXml of 연계XmlAll) {
          const linkUrl = extractTag(linkXml, "조문연계용어링크");
          const { lawId, joCode } = parseLinkParams(linkUrl);
          연계법령.push({
            법령명: extractTag(linkXml, "법령명"),
            조번호: extractTag(linkXml, "조번호"),
            조가지번호: extractTag(linkXml, "조가지번호"),
            조문내용: extractTag(linkXml, "조문내용"),
            용어구분: extractTag(linkXml, "용어구분"),
            lawId,
            joCode,
          });
        }
        groups.push({ 법령용어명, 연계법령 });
      }

      const totalLinks = groups.reduce((sum, g) => sum + g.연계법령.length, 0);

      let text = `법령용어-조문 연계 — "${args.query}"\n`;
      text += `용어 그룹 ${groups.length}건 · 연계 조문 총 ${totalLinks}건`;
      if (totalLinks > args.maxArticles * groups.length) {
        text += ` (그룹별 상위 ${args.maxArticles}건 표시)`;
      }
      text += "\n\n";

      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        if (!g) continue;
        text += `📌 [법령용어 ${gi + 1}] ${g.법령용어명}\n`;
        text += `   연계 조문 ${g.연계법령.length}건`;
        const truncated = g.연계법령.length > args.maxArticles;
        if (truncated) text += ` (상위 ${args.maxArticles}건 표시)`;
        text += "\n";

        const items = g.연계법령.slice(0, args.maxArticles);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (!it) continue;
          const articleStr = articleNumber(it.조번호, it.조가지번호);
          text += `   [${i + 1}] ${it.법령명} ${articleStr}`;
          if (it.용어구분) text += ` (${it.용어구분})`;
          if (it.lawId) text += ` [lawId=${it.lawId} jo=${it.joCode}]`;
          text += "\n";
          if (args.includeBody && it.조문내용) {
            text += `       ${clip(it.조문내용, PREVIEW_CHARS)}\n`;
          }
        }
        text += "\n";
      }

      // 첫 그룹·첫 조문에 대해 다음 도구 권유
      const firstGroup = groups[0];
      const firstItem = firstGroup?.연계법령[0];
      if (firstItem) {
        const suggestions: Array<{
          tool: string;
          args: Record<string, unknown>;
          reason: string;
        }> = [];
        if (firstItem.lawId) {
          suggestions.push({
            tool: "get_law_text",
            args: { lawId: firstItem.lawId },
            reason: `${firstItem.법령명} 전문`,
          });
        }
        suggestions.push({
          tool: "get_legal_term",
          args: { query: args.query },
          reason: `"${args.query}" 정의 확인`,
        });
        text = appendSuggestions(text, suggestions);
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_term_articles");
    }
  },
};
