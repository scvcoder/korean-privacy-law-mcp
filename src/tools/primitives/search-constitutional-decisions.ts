import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { constitutionalDecisionUrl } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "헌법재판소 결정례 키워드. 사건명·사건번호 매칭 (예: '개인정보 자기결정권', '주민등록번호')."
    ),
  display: z.number().int().min(1).max(100).default(20).describe("결과 개수 (기본 20)"),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
});

interface ConstitutionalItem {
  헌재결정례일련번호: string;
  사건번호: string;
  사건명: string;
  종국일자: string;
}

export const searchConstitutionalDecisions: Tool<typeof inputSchema> = {
  name: "search_constitutional_decisions",
  description:
    "헌법재판소 결정례 검색 (법제처 lawSearch · target=detc). 위헌·합헌·각하 등 헌재 결정 메타. " +
    "개인정보 자기결정권은 헌법상 권리(헌재 99헌마513)이며 PIPA 해석 기초. " +
    "다음: get_constitutional_decision_text(W2.5)로 결정문 전문.",
  inputSchema,

  async handler(args, client) {
    try {
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "detc",
        extraParams: {
          query: args.query,
          display: String(args.display),
          page: String(args.page),
        },
      });

      const result = parseSearchXML<ConstitutionalItem>(
        xml,
        "DetcSearch",
        // detc endpoint quirk — itemTag 대문자 'Detc'
        "Detc",
        (itemXml) => ({
          헌재결정례일련번호: extractTag(itemXml, "헌재결정례일련번호"),
          사건번호: extractTag(itemXml, "사건번호"),
          사건명: extractTag(itemXml, "사건명"),
          종국일자: extractTag(itemXml, "종국일자"),
        })
      );

      if (result.totalCnt === 0) {
        return notFoundResponse(
          `헌재 결정례 검색 결과 없음: "${args.query}"`,
          [
            `search_pipc_decisions(query="${args.query}") — PIPC 의결도 시도`,
            `intelligent_law_search(query="${args.query}") — 법령 조문 검색`,
          ]
        );
      }

      let text = `헌재 결정례 — "${args.query}"\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시 (페이지 ${result.page})\n\n`;

      for (const item of result.items) {
        text += `[id=${item.헌재결정례일련번호}] ${item.사건명}\n`;
        if (item.사건번호) text += `  사건번호: ${item.사건번호}\n`;
        if (item.종국일자) text += `  종국일자: ${item.종국일자}\n`;
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_constitutional_decision_text",
            args: { id: firstItem.헌재결정례일련번호 },
            reason: `${firstItem.사건명.slice(0, 30)}... 전문`,
          },
        ]);
        text += `\n📎 출처: 헌법재판소 결정례 — 첫 결과 ${constitutionalDecisionUrl(firstItem.헌재결정례일련번호)}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_constitutional_decisions");
    }
  },
};
