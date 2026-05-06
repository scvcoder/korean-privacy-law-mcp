import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, extractTagAll } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";

const MAX_BODY_CHARS = 12_000;

const inputSchema = z.object({
  mst: z
    .string()
    .min(1)
    .describe(
      "행정규칙일련번호 — 신조문(현행) 또는 구조문(연혁) 둘 다 수용. " +
        "search_admin_rule 결과의 mst=N 사용."
    ),
});

interface RuleBasicInfo {
  행정규칙일련번호: string;
  행정규칙ID: string;
  시행일자: string;
  발령일자: string;
  발령번호: string;
  현행여부: string;
  제개정구분명: string;
  행정규칙명: string;
  행정규칙종류: string;
}

function parseBasicInfo(xml: string): RuleBasicInfo {
  return {
    행정규칙일련번호: extractTag(xml, "행정규칙일련번호"),
    행정규칙ID: extractTag(xml, "행정규칙ID"),
    시행일자: extractTag(xml, "시행일자"),
    발령일자: extractTag(xml, "발령일자"),
    발령번호: extractTag(xml, "발령번호"),
    현행여부: extractTag(xml, "현행여부"),
    제개정구분명: extractTag(xml, "제개정구분명"),
    행정규칙명: extractTag(xml, "행정규칙명"),
    행정규칙종류: extractTag(xml, "행정규칙종류"),
  };
}

function formatBasicInfo(label: string, info: RuleBasicInfo): string {
  const flag = info.현행여부 === "Y" ? "현행" : info.현행여부 === "N" ? "연혁" : info.현행여부;
  let s = `[${label}] ${info.제개정구분명 || ""}`;
  if (flag) s += ` · ${flag}`;
  s += "\n";
  s += `  시행: ${info.시행일자} · 발령: ${info.발령일자}`;
  if (info.발령번호) s += ` (${info.발령번호})`;
  s += `\n  mst: ${info.행정규칙일련번호}\n`;
  return s;
}

/** <P>변경부분</P> → **변경부분** (markdown bold) */
function highlightChanges(s: string): string {
  return s.replace(/<P>([\s\S]*?)<\/P>/g, "**$1**");
}

export const compareAdminRuleOldNew: Tool<typeof inputSchema> = {
  name: "compare_admin_rule_old_new",
  description:
    "행정규칙 신구법 비교 (법제처 lawService · target=admrulOldAndNew). " +
    "구조문(이전 버전)과 신조문(개정 후) 기본정보 + 변경된 조문 목록을 평행 노출. " +
    "변경 부분은 `**변경**` 강조. PIPC 고시 개정 추적에 직접 활용 (예: 안전성 확보조치 기준 2023.9 → 2025.10). " +
    "다음: get_admin_rule_text(mst)로 신/구 각 버전 전문, search_admin_rule로 다른 고시 검색.",
  inputSchema,

  async handler(args, client) {
    try {
      const xmlText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "admrulOldAndNew",
        type: "XML",
        extraParams: { ID: args.mst },
      });

      // 실패 응답: <Law>일치하는 신구법 없습니다.</Law>
      const lawError = extractTag(xmlText, "Law");
      if (lawError && lawError.includes("없습니다")) {
        return notFoundResponse(`신구법 비교 데이터 없음: ${lawError}`, [
          `search_admin_rule(query="...") — 유효한 mst 확인`,
          `get_admin_rule_text(mst="${args.mst}") — 단일 버전 본문 조회`,
        ]);
      }

      const service = extractTag(xmlText, "AdmRulOldAndNewService");
      if (!service) {
        return notFoundResponse(`행정규칙 신구법 응답 비어 있음 (mst=${args.mst})`, [
          `search_admin_rule(query="...") — 유효한 mst 확인`,
        ]);
      }

      const oldInfoXml = extractTag(service, "구조문_기본정보");
      const newInfoXml = extractTag(service, "신조문_기본정보");
      const oldArticlesXml = extractTag(service, "구조문목록");
      const newArticlesXml = extractTag(service, "신조문목록");

      if (!oldInfoXml && !newInfoXml) {
        return notFoundResponse(`신구법 비교 데이터 없음 (mst=${args.mst})`, []);
      }

      const oldInfo = oldInfoXml ? parseBasicInfo(oldInfoXml) : null;
      const newInfo = newInfoXml ? parseBasicInfo(newInfoXml) : null;
      const ruleName = newInfo?.행정규칙명 || oldInfo?.행정규칙명 || "(이름 없음)";

      let text = `=== ${ruleName} — 신구법 비교 ===\n\n`;
      if (oldInfo) text += formatBasicInfo("구조문", oldInfo);
      if (newInfo) text += formatBasicInfo("신조문", newInfo);
      text += "\n";

      const oldArticles = oldArticlesXml
        ? extractTagAll(oldArticlesXml, "조문").map(highlightChanges)
        : [];
      const newArticles = newArticlesXml
        ? extractTagAll(newArticlesXml, "조문").map(highlightChanges)
        : [];

      // 평행 노출 (구조문·신조문 각각 별도 섹션)
      if (oldArticles.length > 0) {
        text += `[구조문 변경 부분 — ${oldArticles.length}개]\n`;
        for (let i = 0; i < oldArticles.length; i++) {
          if (text.length > MAX_BODY_CHARS / 2) {
            text += `⋯ ${oldArticles.length - i}개 더 (12,000자 한도) ⋯\n`;
            break;
          }
          text += `${i + 1}. ${oldArticles[i]}\n\n`;
        }
        text += "\n";
      }

      if (newArticles.length > 0) {
        text += `[신조문 변경 부분 — ${newArticles.length}개]\n`;
        for (let i = 0; i < newArticles.length; i++) {
          if (text.length > MAX_BODY_CHARS) {
            text += `⋯ ${newArticles.length - i}개 더 (12,000자 한도) ⋯\n`;
            break;
          }
          text += `${i + 1}. ${newArticles[i]}\n\n`;
        }
      }

      text += "\n(변경 부분은 `**...**`로 강조 — `<P>` 태그 → markdown bold)\n";

      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [];
      if (newInfo?.행정규칙일련번호 && newInfo.행정규칙일련번호 !== args.mst) {
        suggestions.push({
          tool: "get_admin_rule_text",
          args: { mst: newInfo.행정규칙일련번호 },
          reason: "신조문(현행) 전문",
        });
      }
      if (oldInfo?.행정규칙일련번호 && oldInfo.행정규칙일련번호 !== args.mst) {
        suggestions.push({
          tool: "get_admin_rule_text",
          args: { mst: oldInfo.행정규칙일련번호 },
          reason: "구조문(연혁) 전문",
        });
      }
      if (suggestions.length > 0) {
        text = appendSuggestions(text, suggestions);
      }
      text += `\n📎 출처: ${ruleName} 신구법 비교 (법제처 DB)`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "compare_admin_rule_old_new");
    }
  },
};
