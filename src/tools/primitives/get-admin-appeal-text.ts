import { z } from "zod";
import type { Tool } from "../types.js";
import { stripHtmlTags } from "../../client/xml-parse.js";
import { compactBody } from "../../lib/compact.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { adminAppealUrl } from "../../lib/external-links.js";

const FIELD_COMPACT_THRESHOLD = 2_500;

const inputSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "행정심판 재결례 일련번호 (search_admin_appeals 결과의 [id=N])"
    ),
});

interface AdminAppealData {
  행정심판례일련번호?: string;
  사건번호?: string;
  사건명?: string;
  재결청?: string;
  처분청?: string;
  처분일자?: string;
  의결일자?: string;
  재결례유형명?: string;
  재결례유형코드?: string;
  청구취지?: string;
  재결요지?: string;
  이유?: string;
  주문?: string;
}

function formatField(label: string, value: string | undefined): string {
  if (!value) return "";
  const cleaned = stripHtmlTags(value);
  if (!cleaned) return "";
  const compacted =
    cleaned.length > FIELD_COMPACT_THRESHOLD
      ? compactBody(cleaned, {
          headLimit: 1500,
          tailLimit: 800,
          minLength: FIELD_COMPACT_THRESHOLD,
        })
      : cleaned;
  return `\n[${label}]\n${compacted}\n`;
}

export const getAdminAppealText: Tool<typeof inputSchema> = {
  name: "get_admin_appeal_text",
  description:
    "행정심판 재결례 본문 (법제처 lawService · target=decc). 사건명·재결청·청구취지·재결요지·주문·이유 추출. " +
    "PIPA 위반에 대한 시정명령·과징금 등 행정처분 불복 사례 분석. 긴 이유는 자동 축약. " +
    "다음: search_admin_appeals로 유사 처분 사례, get_pipc_decision_text로 원처분 PIPC 결정 추적.",
  inputSchema,

  async handler(args, client) {
    try {
      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "decc",
        type: "JSON",
        extraParams: { ID: args.id },
      });

      let parsed: { PrecService?: AdminAppealData; Law?: string };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return notFoundResponse(`행정심판 재결례 응답 파싱 실패 (id=${args.id})`, [
          `search_admin_appeals(query="...") — 유효한 id 확인`,
        ]);
      }

      if (typeof parsed.Law === "string") {
        return notFoundResponse(`행정심판 재결례 없음: ${parsed.Law}`, [
          `search_admin_appeals(query="...") — 유효한 id 확인`,
        ]);
      }

      // decc endpoint quirk — 응답 root key가 'PrecService' (DeccService 아님)
      const decision = parsed.PrecService;
      if (!decision) {
        return notFoundResponse(`행정심판 재결례 데이터 없음 (id=${args.id})`, [
          `search_admin_appeals(query="...") — 유효한 id 확인`,
        ]);
      }

      const title = decision.사건명 ?? "(사건명 없음)";

      let text = `=== ${title} ===\n`;
      if (decision.사건번호) text += `사건번호: ${decision.사건번호}\n`;
      if (decision.재결청) text += `재결청: ${decision.재결청}\n`;
      if (decision.처분청) text += `처분청: ${decision.처분청}\n`;
      if (decision.처분일자) text += `처분일자: ${decision.처분일자}\n`;
      if (decision.의결일자) text += `의결일자: ${decision.의결일자}\n`;
      if (decision.재결례유형명) text += `유형: ${decision.재결례유형명}\n`;
      if (decision.행정심판례일련번호)
        text += `재결례ID: ${decision.행정심판례일련번호}\n`;

      // 핵심 본문 — 우선순위 (청구취지 → 재결요지 → 주문 → 이유)
      text += formatField("청구취지", decision.청구취지);
      text += formatField("재결요지", decision.재결요지);
      text += formatField("주문", decision.주문);
      text += formatField("이유", decision.이유);

      text = appendSuggestions(text, [
        {
          tool: "search_admin_appeals",
          args: { query: title.slice(0, 20) },
          reason: "유사 행정심판 사례 검색",
        },
      ]);
      text += `\n📎 출처: 행정심판 재결례 (id=${args.id}) — ${adminAppealUrl(args.id)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_admin_appeal_text");
    }
  },
};
