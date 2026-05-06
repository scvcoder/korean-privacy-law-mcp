import { z } from "zod";
import type { Tool } from "../types.js";
import { stripHtmlTags } from "../../client/xml-parse.js";
import { compactBody } from "../../lib/compact.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { pipcDecisionUrl } from "../../lib/external-links.js";

const LAW_GO_KR = "https://www.law.go.kr";
const FIELD_COMPACT_THRESHOLD = 2_500;

const inputSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "PIPC 결정문일련번호 (search_pipc_decisions 결과의 [id=N])"
    ),
});

interface PipcDecisionData {
  안건명?: string;
  안건번호?: string;
  결정문일련번호?: string;
  의결연월일?: string;
  의결일자?: string;
  회의종류?: string;
  신청인?: string;
  결정?: string;
  결정요지?: string;
  주문?: string;
  이유?: string;
  배경?: string;
  별지?: string;
  위원서명?: string;
  기관명?: string;
  이의제기방법및기간?: string;
  주요내용?: string;
}

function extractAttachmentLinks(annexHtml: string): string[] {
  if (!annexHtml) return [];
  const links: string[] = [];
  const re = /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(annexHtml)) !== null) {
    const src = m[1] ?? "";
    const alt = m[2] ?? "";
    const url = src.startsWith("/") ? `${LAW_GO_KR}${src}` : src;
    links.push(`${alt || "별지"}: ${url}`);
  }
  return links;
}

function formatField(label: string, value: string | undefined): string {
  if (!value) return "";
  const cleaned = stripHtmlTags(value);
  if (!cleaned) return "";
  const compacted =
    cleaned.length > FIELD_COMPACT_THRESHOLD
      ? compactBody(cleaned, { headLimit: 1500, tailLimit: 800, minLength: FIELD_COMPACT_THRESHOLD })
      : cleaned;
  return `\n[${label}]\n${compacted}\n`;
}

export const getPipcDecisionText: Tool<typeof inputSchema> = {
  name: "get_pipc_decision_text",
  description:
    "PIPC 결정문 전문 (법제처 lawService · target=ppc). 안건명·결정요지·주문·이유·배경 등 구조화 필드 추출. " +
    "별지(첨부 이미지·PDF) 링크 자동 추출. 긴 본문은 자동 축약. " +
    "다음: search_pipc_decisions로 유사 사례 검색 비교, get_law_text로 인용 조문 확인.",
  inputSchema,

  async handler(args, client) {
    try {
      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "ppc",
        type: "JSON",
        extraParams: { ID: args.id },
      });

      let parsed: { PpcService?: { 의결서?: PipcDecisionData }; Law?: string };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return notFoundResponse(`PIPC 결정문 응답 파싱 실패 (id=${args.id})`, [
          `search_pipc_decisions(query="...") — 유효한 id 확인`,
        ]);
      }

      // admrul과 동일한 실패 응답 패턴
      if (typeof parsed.Law === "string") {
        return notFoundResponse(`PIPC 결정문 없음: ${parsed.Law}`, [
          `search_pipc_decisions(query="...") — 유효한 id 확인`,
        ]);
      }

      const decision = parsed.PpcService?.의결서;
      if (!decision) {
        return notFoundResponse(`PIPC 결정문 데이터 없음 (id=${args.id})`, [
          `search_pipc_decisions(query="...") — 유효한 id 확인`,
        ]);
      }

      const title = decision.안건명 ?? "(안건명 없음)";
      const date = decision.의결연월일 ?? decision.의결일자 ?? "";

      let text = `=== ${title} ===\n`;
      if (decision.안건번호) text += `안건번호: ${decision.안건번호}\n`;
      if (decision.결정문일련번호) text += `결정문ID: ${decision.결정문일련번호}\n`;
      if (date) text += `의결일: ${date}\n`;
      if (decision.회의종류) text += `회의: ${decision.회의종류}\n`;
      if (decision.신청인) text += `신청인: ${decision.신청인}\n`;
      if (decision.결정) text += `결정: ${decision.결정}\n`;

      // 핵심 본문 필드 — 우선순위 순서 (요지 → 주문 → 이유 → 배경 → 주요내용)
      text += formatField("결정요지", decision.결정요지);
      text += formatField("주문", decision.주문);
      text += formatField("이유", decision.이유);
      text += formatField("배경", decision.배경);
      text += formatField("주요내용", decision.주요내용);

      // 별지 (이미지·PDF 첨부 링크)
      const attachments = extractAttachmentLinks(decision.별지 ?? "");
      if (attachments.length > 0) {
        text += `\n[첨부] ${attachments.length}건\n`;
        for (const link of attachments) text += `  - ${link}\n`;
      }

      if (decision.위원서명) {
        const signatures = decision.위원서명.replace(/\s+/g, " ").trim();
        text += `\n[위원서명] ${signatures}\n`;
      }
      if (decision.이의제기방법및기간) {
        text += `\n[이의제기] ${decision.이의제기방법및기간}\n`;
      }

      text = appendSuggestions(text, [
        {
          tool: "search_pipc_decisions",
          args: { query: title.slice(0, 20) },
          reason: "유사 결정문 검색 (위반유형·과징금 비교)",
        },
      ]);
      text += `\n📎 출처: 개인정보보호위원회 결정문 (id=${args.id}) — ${pipcDecisionUrl(args.id)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_pipc_decision_text");
    }
  },
};
