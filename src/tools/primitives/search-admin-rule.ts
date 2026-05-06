import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { adminRuleUrl } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "행정규칙(고시·훈령·예규) 키워드. PIPC 고시 8개와 부처별 개인정보보호 훈령 22개가 핵심."
    ),
  display: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100)
    .describe("결과 개수 (기본 100)"),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
});

interface AdminRuleItem {
  행정규칙일련번호: string;
  행정규칙ID: string;
  행정규칙명: string;
  행정규칙종류: string;
  소관부처명: string;
  발령일자: string;
  발령번호: string;
  시행일자: string;
  현행연혁구분: string;
  제개정구분명: string;
}

export const searchAdminRule: Tool<typeof inputSchema> = {
  name: "search_admin_rule",
  description:
    "행정규칙 검색 (법제처 lawSearch · target=admrul). 고시·훈령·예규 등 행정규칙 메타데이터 조회. " +
    "개인정보 도메인의 핵심 — PIPC 공식 고시 8건 + 부처 개인정보보호 훈령 22건이 모두 여기 있음. " +
    "다음: get_admin_rule_text(W2.4)로 본문, compare_admin_rule_old_new(W2.4)로 신구법.",
  inputSchema,

  async handler(args, client) {
    try {
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "admrul",
        extraParams: {
          query: args.query,
          display: String(args.display),
          page: String(args.page),
        },
      });

      const result = parseSearchXML<AdminRuleItem>(
        xml,
        "AdmRulSearch",
        "admrul",
        (itemXml) => ({
          행정규칙일련번호: extractTag(itemXml, "행정규칙일련번호"),
          행정규칙ID: extractTag(itemXml, "행정규칙ID"),
          행정규칙명: extractTag(itemXml, "행정규칙명"),
          행정규칙종류: extractTag(itemXml, "행정규칙종류"),
          소관부처명: extractTag(itemXml, "소관부처명"),
          발령일자: extractTag(itemXml, "발령일자"),
          발령번호: extractTag(itemXml, "발령번호"),
          시행일자: extractTag(itemXml, "시행일자"),
          현행연혁구분: extractTag(itemXml, "현행연혁구분"),
          제개정구분명: extractTag(itemXml, "제개정구분명"),
        })
      );

      if (result.totalCnt === 0) {
        return notFoundResponse(`행정규칙 검색 결과 없음: "${args.query}"`, [
          `intelligent_law_search(query="${args.query}", search="2") — 행정규칙 조문 본문 검색`,
          `search_law(query="${args.query}") — 법령으로 검색`,
        ]);
      }

      let text = `행정규칙 검색 — ${args.query}\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시 (페이지 ${result.page})\n\n`;

      for (const item of result.items) {
        text += `[id=${item.행정규칙ID}, mst=${item.행정규칙일련번호}] ${item.행정규칙명}`;
        if (item.행정규칙종류) text += ` (${item.행정규칙종류})`;
        if (item.현행연혁구분 && item.현행연혁구분 !== "현행")
          text += ` [${item.현행연혁구분}]`;
        text += "\n";
        if (item.소관부처명) text += `  소관: ${item.소관부처명}\n`;
        if (item.시행일자) text += `  시행: ${item.시행일자}\n`;
        if (item.발령일자) text += `  발령: ${item.발령일자}\n`;
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_admin_rule_text",
            // 본문 조회는 행정규칙일련번호(mst) 필수 (행정규칙ID는 미작동)
            args: { mst: firstItem.행정규칙일련번호 },
            reason: `${firstItem.행정규칙명} 본문 조회`,
          },
        ]);
        text += `\n📎 출처: 행정규칙 — 첫 결과 ${adminRuleUrl(firstItem.행정규칙일련번호)}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "search_admin_rule");
    }
  },
};
