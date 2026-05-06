import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML, stripHtmlTags } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "영문 법령 키워드 (예: 'Personal Information Protection', 'Privacy'). 영문명·한글명 모두 매칭."
    ),
  display: z.number().int().min(1).max(100).default(50).describe("결과 개수 (기본 50)"),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
});

interface EnglishLawItem {
  법령일련번호: string;
  법령ID: string;
  법령명한글: string;
  법령명영문: string;
  소관부처명: string;
  법령구분명: string;
  공포일자: string;
  시행일자: string;
}

export const searchEnglishLaw: Tool<typeof inputSchema> = {
  name: "search_english_law",
  description:
    "영문 법령 검색 (법제처 lawSearch · target=elaw). PIPA 영문본 등 한국 법령 영문 번역 조회. " +
    "GDPR 비교, 국외 보고·자문 자료 작성에 직접 활용. " +
    "다음: get_english_law_text(W2.7)로 영문 본문, compare_articles로 PIPA↔GDPR 비교(국외 API 연계는 v2).",
  inputSchema,

  async handler(args, client) {
    try {
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "elaw",
        extraParams: {
          query: args.query,
          display: String(args.display),
          page: String(args.page),
        },
      });

      const result = parseSearchXML<EnglishLawItem>(
        xml,
        "LawSearch",
        "law",
        (itemXml) => ({
          법령일련번호: extractTag(itemXml, "법령일련번호"),
          법령ID: extractTag(itemXml, "법령ID"),
          // elaw quirk — 법령명한글·영문 둘 다 검색 강조 <strong> 태그가 들어옴
          법령명한글: stripHtmlTags(extractTag(itemXml, "법령명한글")),
          법령명영문: stripHtmlTags(extractTag(itemXml, "법령명영문")),
          소관부처명: extractTag(itemXml, "소관부처명"),
          법령구분명: extractTag(itemXml, "법령구분명"),
          공포일자: extractTag(itemXml, "공포일자"),
          시행일자: extractTag(itemXml, "시행일자"),
        })
      );

      if (result.totalCnt === 0) {
        return notFoundResponse(`영문 법령 검색 결과 없음: "${args.query}"`, [
          `search_law(query="${args.query}") — 한글 법령 검색`,
        ]);
      }

      let text = `영문 법령 — "${args.query}"\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시 (페이지 ${result.page})\n\n`;

      for (const item of result.items) {
        text += `[mst=${item.법령일련번호}, lawId=${item.법령ID}]\n`;
        text += `  ${item.법령명한글}\n`;
        if (item.법령명영문) text += `  ${item.법령명영문}\n`;
        if (item.법령구분명) text += `  종류: ${item.법령구분명}\n`;
        if (item.소관부처명) text += `  소관: ${item.소관부처명.split(",")[0]}\n`;
        if (item.시행일자) text += `  시행: ${item.시행일자}\n`;
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_english_law_text",
            args: { mst: firstItem.법령일련번호 },
            reason: `${firstItem.법령명영문 || firstItem.법령명한글} 영문 본문`,
          },
          {
            tool: "get_law_text",
            args: { mst: firstItem.법령일련번호 },
            reason: "한글 본문 비교",
          },
        ]);
        text += `\n${formatLawAttribution(firstItem.법령명한글)}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_english_law");
    }
  },
};
