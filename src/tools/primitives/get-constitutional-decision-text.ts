import { z } from "zod";
import type { Tool } from "../types.js";
import { stripHtmlTags } from "../../client/xml-parse.js";
import { compactBody } from "../../lib/compact.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { constitutionalDecisionUrl } from "../../lib/external-links.js";

const FIELD_COMPACT_THRESHOLD = 2_500;

const inputSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "헌재결정례일련번호 (search_constitutional_decisions 결과의 [id=N])"
    ),
});

interface ConstitutionalDecisionData {
  헌재결정례일련번호?: string;
  사건명?: string;
  사건번호?: string;
  사건종류명?: string;
  사건종류코드?: string;
  종국일자?: string;
  재판부구분코드?: string;
  판시사항?: string;
  결정요지?: string;
  심판대상조문?: string;
  참조조문?: string;
  참조판례?: string;
  전문?: string;
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

export const getConstitutionalDecisionText: Tool<typeof inputSchema> = {
  name: "get_constitutional_decision_text",
  description:
    "헌재 결정문 전문 (법제처 lawService · target=detc). 사건명·사건번호·결정요지·판시사항·전문 추출. " +
    "PIPA 해석의 헌법적 근거(자기결정권 등) 추적. 긴 전문은 자동 축약. " +
    "다음: search_constitutional_decisions로 유사 사건, intelligent_law_search로 인용 조문 검색.",
  inputSchema,

  async handler(args, client) {
    try {
      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "detc",
        type: "JSON",
        extraParams: { ID: args.id },
      });

      let parsed: { DetcService?: ConstitutionalDecisionData; Law?: string };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return notFoundResponse(`헌재 결정문 응답 파싱 실패 (id=${args.id})`, [
          `search_constitutional_decisions(query="...") — 유효한 id 확인`,
        ]);
      }

      if (typeof parsed.Law === "string") {
        return notFoundResponse(`헌재 결정문 없음: ${parsed.Law}`, [
          `search_constitutional_decisions(query="...") — 유효한 id 확인`,
        ]);
      }

      const decision = parsed.DetcService;
      if (!decision) {
        return notFoundResponse(`헌재 결정문 데이터 없음 (id=${args.id})`, [
          `search_constitutional_decisions(query="...") — 유효한 id 확인`,
        ]);
      }

      const title = decision.사건명 ?? "(사건명 없음)";

      let text = `=== ${title} ===\n`;
      if (decision.사건번호) text += `사건번호: ${decision.사건번호}\n`;
      if (decision.사건종류명) text += `사건종류: ${decision.사건종류명}\n`;
      if (decision.종국일자) text += `종국일자: ${decision.종국일자}\n`;
      if (decision.헌재결정례일련번호)
        text += `결정례ID: ${decision.헌재결정례일련번호}\n`;

      // 핵심 본문 — 우선순위 (판시사항 → 결정요지 → 전문)
      text += formatField("판시사항", decision.판시사항);
      text += formatField("결정요지", decision.결정요지);
      text += formatField("심판대상조문", decision.심판대상조문);
      text += formatField("참조조문", decision.참조조문);
      text += formatField("참조판례", decision.참조판례);
      text += formatField("전문", decision.전문);

      text = appendSuggestions(text, [
        {
          tool: "search_constitutional_decisions",
          args: { query: title.slice(0, 20) },
          reason: "유사 헌재 결정 검색",
        },
      ]);
      text += `\n📎 출처: 헌법재판소 결정례 (id=${args.id}) — ${constitutionalDecisionUrl(args.id)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_constitutional_decision_text");
    }
  },
};
