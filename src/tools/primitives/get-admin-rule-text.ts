import { z } from "zod";
import type { Tool } from "../types.js";
import { asArray } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatAdminRuleAttribution } from "../../lib/external-links.js";

const MAX_BODY_CHARS = 12_000;

const inputSchema = z.object({
  mst: z
    .string()
    .min(1)
    .describe(
      "행정규칙일련번호 (search_admin_rule 결과의 mst=N). " +
        "주의: 행정규칙ID(짧은 번호)와 다름 — 본문 조회는 일련번호만 작동."
    ),
});

interface AdminRuleBasicInfo {
  행정규칙명?: string;
  행정규칙종류?: string;
  소관부처명?: string;
  발령일자?: string;
  발령번호?: string;
  시행일자?: string;
  현행여부?: string;
  제개정구분명?: string;
  행정규칙ID?: string;
  행정규칙일련번호?: string;
  담당부서기관명?: string;
}

interface AdminRuleService {
  행정규칙기본정보?: AdminRuleBasicInfo;
  조문내용?: string | string[];
  별표?: unknown;
  부칙?: unknown;
}

export const getAdminRuleText: Tool<typeof inputSchema> = {
  name: "get_admin_rule_text",
  description:
    "행정규칙 본문 조회 (법제처 lawService · target=admrul). 고시·훈령·예규의 전문. " +
    "search_admin_rule이 반환한 mst(행정규칙일련번호) 사용. " +
    "PIPC 안전성 확보조치 기준·표준 처리지침·가명정보 결합 고시 등 직접 조회. " +
    "다음: compare_admin_rule_old_new(W2.4)로 신구법 비교.",
  inputSchema,

  async handler(args, client) {
    try {
      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "admrul",
        type: "JSON",
        extraParams: { ID: args.mst },
      });

      let parsed: { AdmRulService?: AdminRuleService; Law?: string };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return notFoundResponse(`행정규칙 본문 응답 파싱 실패 (mst=${args.mst})`, [
          `search_admin_rule(query="...") — 유효한 mst 확인`,
        ]);
      }

      // API가 매칭 실패 시 {"Law": "일치하는 행정규칙이 없습니다 ..."} 반환
      if (parsed.Law && typeof parsed.Law === "string") {
        return notFoundResponse(`행정규칙 없음: ${parsed.Law}`, [
          `search_admin_rule(query="...") — 유효한 mst 확인`,
        ]);
      }

      const service = parsed.AdmRulService;
      if (!service) {
        return notFoundResponse(`행정규칙 데이터 없음 (mst=${args.mst})`, [
          `search_admin_rule(query="...") — 유효한 mst 확인`,
        ]);
      }

      const info = service.행정규칙기본정보 ?? {};
      const ruleName = info.행정규칙명 ?? "(이름 없음)";
      const ruleKind = info.행정규칙종류 ?? "행정규칙";

      let text = `=== ${ruleName} ===\n`;
      text += `종류: ${ruleKind}`;
      if (info.제개정구분명) text += ` · ${info.제개정구분명}`;
      if (info.현행여부 === "Y") text += " · 현행";
      else if (info.현행여부) text += ` · ${info.현행여부}`;
      text += "\n";
      if (info.소관부처명) text += `소관: ${info.소관부처명}\n`;
      if (info.담당부서기관명) text += `담당: ${info.담당부서기관명}\n`;
      if (info.발령일자) text += `발령: ${info.발령일자}`;
      if (info.발령번호) text += ` (${info.발령번호})`;
      if (info.발령일자) text += "\n";
      if (info.시행일자) text += `시행: ${info.시행일자}\n`;
      text += "\n";

      const articleLines = asArray(service.조문내용).filter(
        (s): s is string => typeof s === "string"
      );

      if (articleLines.length === 0) {
        text += "(조문 데이터 없음)\n";
      } else {
        text += `조문 (총 ${articleLines.length}개 항목):\n\n`;
        const headerStart = text.length;
        for (let i = 0; i < articleLines.length; i++) {
          const line = articleLines[i]!;
          text += `${line}\n\n`;
          if (text.length - headerStart > MAX_BODY_CHARS) {
            const remaining = articleLines.length - i - 1;
            if (remaining > 0) {
              text += `⋯ ${remaining}개 항목 생략 (12,000자 한도) ⋯\n`;
            }
            break;
          }
        }
      }

      // 별표·부칙 메타
      const annexes = asArray(service.별표);
      if (annexes.length) text += `\n[별표] ${annexes.length}건 (별도 조회)\n`;
      const supplementary = asArray(service.부칙);
      if (supplementary.length) text += `[부칙] ${supplementary.length}건\n`;

      text = appendSuggestions(text, [
        {
          tool: "compare_admin_rule_old_new",
          args: { mst: args.mst },
          reason: "신구법 비교 (개정 추적, W2.4)",
        },
      ]);
      // args.mst = 행정규칙일련번호 (admRulSeq와 호환)
      text += `\n${formatAdminRuleAttribution(ruleName, args.mst)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_admin_rule_text");
    }
  },
};
