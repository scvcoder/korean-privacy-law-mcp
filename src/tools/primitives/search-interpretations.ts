import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { interpretationUrl } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("법령해석례 키워드. 안건명·안건번호·질의기관·회신기관 매칭."),
  display: z.number().int().min(1).max(100).default(20).describe("결과 개수 (기본 20)"),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
});

interface InterpretationItem {
  법령해석례일련번호: string;
  안건명: string;
  안건번호: string;
  질의기관명: string;
  회신기관명: string;
  회신일자: string;
}

export const searchInterpretations: Tool<typeof inputSchema> = {
  name: "search_interpretations",
  description:
    "법령해석례 검색 (법제처 lawSearch · target=expc). 법제처·부처가 회신한 공식 해석 결정 메타. " +
    "조문 해석에 의문 있을 때 PIPA·시행령 적용 사례를 회신 기록으로 확인. " +
    "다음: get_interpretation_text(W2.6)로 해석 본문.",
  inputSchema,

  async handler(args, client) {
    try {
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "expc",
        extraParams: {
          query: args.query,
          display: String(args.display),
          page: String(args.page),
        },
      });

      const result = parseSearchXML<InterpretationItem>(
        xml,
        "Expc",
        "expc",
        (itemXml) => ({
          법령해석례일련번호: extractTag(itemXml, "법령해석례일련번호"),
          안건명: extractTag(itemXml, "안건명"),
          안건번호: extractTag(itemXml, "안건번호"),
          질의기관명: extractTag(itemXml, "질의기관명"),
          회신기관명: extractTag(itemXml, "회신기관명"),
          회신일자: extractTag(itemXml, "회신일자"),
        })
      );

      if (result.totalCnt === 0) {
        return notFoundResponse(`법령해석례 검색 결과 없음: "${args.query}"`, [
          `search_pipc_decisions(query="${args.query}") — PIPC 의결 시도`,
          `intelligent_law_search(query="${args.query}") — 법령 조문 검색`,
        ]);
      }

      let text = `법령해석례 — "${args.query}"\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시 (페이지 ${result.page})\n\n`;

      for (const item of result.items) {
        text += `[id=${item.법령해석례일련번호}] ${item.안건명}\n`;
        if (item.안건번호) text += `  안건번호: ${item.안건번호}\n`;
        if (item.질의기관명) text += `  질의: ${item.질의기관명}\n`;
        if (item.회신기관명) text += `  회신: ${item.회신기관명}\n`;
        if (item.회신일자) text += `  회신일: ${item.회신일자}\n`;
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_interpretation_text",
            args: { id: firstItem.법령해석례일련번호 },
            reason: `${firstItem.안건명.slice(0, 30)}... 해석 본문`,
          },
        ]);
        text += `\n📎 출처: 법령해석례 — 첫 결과 ${interpretationUrl(firstItem.법령해석례일련번호)}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_interpretations");
    }
  },
};
