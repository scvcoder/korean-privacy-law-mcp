import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { adminAppealUrl } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "행정심판 재결례 키워드. 사건명·사건번호 매칭 (예: '개인정보 열람 거부', '처분 취소')."
    ),
  display: z.number().int().min(1).max(100).default(20).describe("결과 개수 (기본 20)"),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
});

interface AdminAppealItem {
  행정심판재결례일련번호: string;
  사건번호: string;
  사건명: string;
  처분일자: string;
  의결일자: string;
  처분청: string;
  재결청: string;
  재결구분명: string;
}

export const searchAdminAppeals: Tool<typeof inputSchema> = {
  name: "search_admin_appeals",
  description:
    "행정심판 재결례 검색 (법제처 lawSearch · target=decc). 행정처분 취소·이행 청구 결정 메타. " +
    "PIPA 위반에 대한 시정명령·과징금 등 행정처분에 대한 불복 사건 확인. " +
    "다음: get_admin_appeal_text(W2.5)로 재결례 전문.",
  inputSchema,

  async handler(args, client) {
    try {
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "decc",
        extraParams: {
          query: args.query,
          display: String(args.display),
          page: String(args.page),
        },
      });

      const result = parseSearchXML<AdminAppealItem>(
        xml,
        "Decc",
        "decc",
        (itemXml) => ({
          행정심판재결례일련번호: extractTag(itemXml, "행정심판재결례일련번호"),
          사건번호: extractTag(itemXml, "사건번호"),
          사건명: extractTag(itemXml, "사건명"),
          처분일자: extractTag(itemXml, "처분일자"),
          의결일자: extractTag(itemXml, "의결일자"),
          처분청: extractTag(itemXml, "처분청"),
          재결청: extractTag(itemXml, "재결청"),
          재결구분명: extractTag(itemXml, "재결구분명"),
        })
      );

      if (result.totalCnt === 0) {
        return notFoundResponse(`행정심판 재결례 검색 결과 없음: "${args.query}"`, [
          `search_pipc_decisions(query="${args.query}") — PIPC 의결도 시도`,
        ]);
      }

      let text = `행정심판 재결례 — "${args.query}"\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시 (페이지 ${result.page})\n\n`;

      for (const item of result.items) {
        text += `[id=${item.행정심판재결례일련번호}] ${item.사건명}\n`;
        if (item.사건번호) text += `  사건번호: ${item.사건번호}\n`;
        if (item.재결청) text += `  재결청: ${item.재결청}\n`;
        if (item.처분청) text += `  처분청: ${item.처분청}\n`;
        if (item.의결일자) text += `  의결일자: ${item.의결일자}\n`;
        if (item.재결구분명) text += `  재결구분: ${item.재결구분명}\n`;
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_admin_appeal_text",
            args: { id: firstItem.행정심판재결례일련번호 },
            reason: `${firstItem.사건명.slice(0, 30)}... 재결례 전문`,
          },
        ]);
        text += `\n📎 출처: 행정심판 재결례 — 첫 결과 ${adminAppealUrl(firstItem.행정심판재결례일련번호)}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_admin_appeals");
    }
  },
};
