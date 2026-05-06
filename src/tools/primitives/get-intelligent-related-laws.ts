import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { lawDetailUrl } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "키워드. AI가 의미적으로 연관된 법령 조문 추천 (intelligent_law_search보다 폭넓은 의미 매칭)."
    ),
  search: z
    .enum(["0", "1"])
    .default("0")
    .describe("검색범위: 0=법령조문 (기본), 1=행정규칙조문"),
  display: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("결과 개수 (기본 20)"),
});

interface RelatedItem {
  법령ID?: string;
  법령명?: string;
  시행일자?: string;
  공포일자?: string;
  조문번호?: string;
  조문가지번호?: string;
  조문제목?: string;
}

export const getIntelligentRelatedLaws: Tool<typeof inputSchema> = {
  name: "get_intelligent_related_laws",
  description:
    "AI 연관법령 조문 (법제처 lawSearch · target=aiRltLs). " +
    "키워드와 의미적으로 연관된 조문 list를 AI가 추천. " +
    "intelligent_law_search보다 폭넓은 의미 매칭 (본문 직접 매칭 X, AI가 추천한 조문 제목 list). " +
    "다음: get_law_text(lawId)로 추천 조문의 전체 본문 조회.",
  inputSchema,

  async handler(args, client) {
    try {
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "aiRltLs",
        extraParams: {
          query: args.query,
          search: args.search,
          display: String(args.display),
        },
      });

      const result = parseSearchXML<RelatedItem>(
        xml,
        "aiRltLsSearch",
        "법령조문",
        (itemXml) => ({
          법령ID: extractTag(itemXml, "법령ID"),
          법령명: extractTag(itemXml, "법령명"),
          시행일자: extractTag(itemXml, "시행일자"),
          공포일자: extractTag(itemXml, "공포일자"),
          조문번호: extractTag(itemXml, "조문번호"),
          조문가지번호: extractTag(itemXml, "조문가지번호"),
          조문제목: extractTag(itemXml, "조문제목"),
        }),
        // aiSearch와 동일 quirk — totalCnt 대신 검색결과개수
        { totalCntTag: "검색결과개수" }
      );

      if (result.totalCnt === 0) {
        return notFoundResponse(
          `AI 연관법령 결과 없음: "${args.query}" (search=${args.search})`,
          [
            `intelligent_law_search(query="${args.query}") — 본문 직접 매칭`,
            `search_law(query="${args.query}") — 법령명 검색`,
          ]
        );
      }

      let text = `AI 연관법령 — "${args.query}" (${args.search === "0" ? "법령조문" : "행정규칙조문"})\n`;
      text += `총 ${result.totalCnt}건\n\n`;

      // 법령별 그룹핑 (같은 법령에 여러 조문 매칭 시 중복 노출 방지)
      const grouped = new Map<string, RelatedItem[]>();
      for (const item of result.items) {
        const key = item.법령ID ?? "unknown";
        const list = grouped.get(key) ?? [];
        list.push(item);
        grouped.set(key, list);
      }

      for (const [, items] of grouped) {
        const first = items[0]!;
        text += `[${first.법령명 ?? "(법령명 없음)"}] (lawId=${first.법령ID ?? "-"})\n`;
        if (first.시행일자) text += `  시행: ${first.시행일자}\n`;
        for (const item of items) {
          const num = item.조문번호 ? parseInt(item.조문번호, 10) : null;
          const branch =
            item.조문가지번호 && item.조문가지번호 !== "00"
              ? `의${parseInt(item.조문가지번호, 10)}`
              : "";
          if (num !== null) {
            text += `  - 제${num}조${branch}`;
            if (item.조문제목) text += ` (${item.조문제목})`;
            text += "\n";
          }
        }
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem?.법령ID) {
        text = appendSuggestions(text, [
          {
            tool: "get_law_text",
            args: { lawId: firstItem.법령ID },
            reason: `${firstItem.법령명 ?? "추천 법령"} 전체 본문`,
          },
          {
            tool: "intelligent_law_search",
            args: { query: args.query },
            reason: "본문 직접 매칭 (조문 내용 포함)",
          },
        ]);
        if (firstItem.법령ID) {
          text += `\n📎 출처: AI 연관법령 — 첫 결과 ${lawDetailUrl(firstItem.법령ID)}`;
        }
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_intelligent_related_laws");
    }
  },
};
