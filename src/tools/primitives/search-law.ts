import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { resolveLawAlias } from "../../lib/aliases.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "법령명·키워드. 약칭(개보법·정통망법·신정법·위치정보법·통비법 등) 자동 인식 후 검색."
    ),
  display: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100)
    .describe("결과 개수 (기본 100, 짧은 법령명 후순위 quirk 회피)"),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
  sort: z
    .enum(["lasc", "ldes", "dasc", "ddes"])
    .optional()
    .describe("정렬: lasc/ldes(법령명 오/내림), dasc/ddes(날짜 오/내림)"),
});

interface LawItem {
  법령일련번호: string;
  법령ID: string;
  법령명한글: string;
  소관부처명: string;
  법령구분명: string;
  공포일자: string;
  시행일자: string;
}

export const searchLaw: Tool<typeof inputSchema> = {
  name: "search_law",
  description:
    "법령 검색 (법제처 lawSearch · target=law). 법령명·메타데이터(소관부처·시행일) 조회. " +
    "약칭(개보법·정통망법 등) 자동 인식. 본 MCP는 개인정보 분야 우선이지만 일반 법령 검색도 가능. " +
    "다음: get_law_text(mst)로 본문, get_related_laws(lawId)로 관계 조회.",
  inputSchema,

  async handler(args, client) {
    try {
      const resolvedQuery = resolveLawAlias(args.query);
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "law",
        extraParams: {
          query: resolvedQuery,
          display: String(args.display),
          page: String(args.page),
          ...(args.sort ? { sort: args.sort } : {}),
        },
      });

      const result = parseSearchXML<LawItem>(xml, "LawSearch", "law", (itemXml) => ({
        법령일련번호: extractTag(itemXml, "법령일련번호"),
        법령ID: extractTag(itemXml, "법령ID"),
        법령명한글: extractTag(itemXml, "법령명한글"),
        소관부처명: extractTag(itemXml, "소관부처명"),
        법령구분명: extractTag(itemXml, "법령구분명"),
        공포일자: extractTag(itemXml, "공포일자"),
        시행일자: extractTag(itemXml, "시행일자"),
      }));

      if (result.totalCnt === 0) {
        const aliasNote =
          resolvedQuery !== args.query ? ` (정규화: "${resolvedQuery}")` : "";
        return notFoundResponse(`법령 검색 결과 없음: "${args.query}"${aliasNote}`, [
          `intelligent_law_search(query="${args.query}") — 의미 기반 검색 fallback`,
        ]);
      }

      const aliasNote =
        resolvedQuery !== args.query ? ` (정규화: ${resolvedQuery})` : "";
      let text = `법령 검색 — ${args.query}${aliasNote}\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시 (페이지 ${result.page})\n\n`;

      for (const item of result.items) {
        text += `[mst=${item.법령일련번호}`;
        if (item.법령ID) text += `, lawId=${item.법령ID}`;
        text += `] ${item.법령명한글}`;
        if (item.법령구분명) text += ` (${item.법령구분명})`;
        text += "\n";
        if (item.소관부처명) text += `  소관: ${item.소관부처명}\n`;
        if (item.시행일자) text += `  시행: ${item.시행일자}\n`;
        if (item.공포일자) text += `  공포: ${item.공포일자}\n`;
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_law_text",
            args: { mst: firstItem.법령일련번호 },
            reason: `${firstItem.법령명한글} 본문 조회`,
          },
          {
            tool: "get_related_laws",
            args: { mst: firstItem.법령일련번호 },
            reason: "시행령·시행규칙·고시 등 하위 규칙 + 관련 법령",
          },
          {
            tool: "get_annexes",
            args: { lawName: firstItem.법령명한글 },
            reason: "별표·서식 (처리방침·동의서 양식 등)",
          },
        ]);
        text += `\n${formatLawAttribution(firstItem.법령명한글)}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_law");
    }
  },
};
