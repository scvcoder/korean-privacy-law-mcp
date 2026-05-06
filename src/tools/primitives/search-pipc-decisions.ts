import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { pipcDecisionUrl } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("PIPC 결정문 키워드. 안건명·결정구분 등 매칭."),
  display: z.number().int().min(1).max(100).default(20).describe("결과 개수 (기본 20)"),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
});

interface PipcDecisionItem {
  결정문일련번호: string;
  안건명: string;
  의안번호: string;
  회의종류: string;
  결정구분: string;
  의결일: string;
}

export const searchPipcDecisions: Tool<typeof inputSchema> = {
  name: "search_pipc_decisions",
  description:
    "개인정보보호위원회(PIPC) 결정문 검색 (법제처 lawSearch · target=ppc). " +
    "심의·의결, 침해요인 평가, 분쟁조정 등 PIPC가 발한 모든 결정문 조회. " +
    "도메인 핵심 — 위반 사례·과징금·시정조치 직접 확인 가능. " +
    "다음: get_pipc_decision_text(W2.5)로 결정문 전문.",
  inputSchema,

  async handler(args, client) {
    try {
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "ppc",
        extraParams: {
          query: args.query,
          display: String(args.display),
          page: String(args.page),
        },
      });

      const result = parseSearchXML<PipcDecisionItem>(
        xml,
        "Ppc",
        "ppc",
        (itemXml) => ({
          결정문일련번호: extractTag(itemXml, "결정문일련번호"),
          안건명: extractTag(itemXml, "안건명"),
          의안번호: extractTag(itemXml, "의안번호"),
          회의종류: extractTag(itemXml, "회의종류"),
          결정구분: extractTag(itemXml, "결정구분"),
          의결일: extractTag(itemXml, "의결일"),
        })
      );

      if (result.totalCnt === 0) {
        return notFoundResponse(`PIPC 결정문 검색 결과 없음: "${args.query}"`, [
          `intelligent_law_search(query="${args.query}") — 법령 조문 검색 fallback`,
        ]);
      }

      let text = `PIPC 결정문 — "${args.query}"\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시 (페이지 ${result.page})\n\n`;

      for (const item of result.items) {
        text += `[id=${item.결정문일련번호}] ${item.안건명}\n`;
        if (item.의안번호) text += `  의안: ${item.의안번호}\n`;
        if (item.결정구분) text += `  구분: ${item.결정구분}\n`;
        if (item.회의종류) text += `  회의: ${item.회의종류}\n`;
        if (item.의결일) text += `  의결일: ${item.의결일}\n`;
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_pipc_decision_text",
            args: { id: firstItem.결정문일련번호 },
            reason: `결정문 전문 — "${firstItem.안건명.slice(0, 30)}..."`,
          },
        ]);
        text += `\n📎 출처: 개인정보보호위원회 결정문 — 첫 결과 ${pipcDecisionUrl(firstItem.결정문일련번호)}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_pipc_decisions");
    }
  },
};
