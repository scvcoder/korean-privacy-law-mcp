import { z } from "zod";
import type { Tool } from "../types.js";
import { stripHtmlTags } from "../../client/xml-parse.js";
import { compactBody } from "../../lib/compact.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { interpretationUrl } from "../../lib/external-links.js";

const FIELD_COMPACT_THRESHOLD = 2_500;

const inputSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe("법령해석례 일련번호 (search_interpretations 결과의 [id=N])"),
});

interface InterpretationData {
  법령해석례일련번호?: string;
  안건명?: string;
  안건번호?: string;
  질의기관명?: string;
  질의기관코드?: string;
  해석기관명?: string;
  해석기관코드?: string;
  해석일자?: string;
  등록일시?: string;
  질의요지?: string;
  회답?: string;
  이유?: string;
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

export const getInterpretationText: Tool<typeof inputSchema> = {
  name: "get_interpretation_text",
  description:
    "법령해석례 본문 (법제처 lawService · target=expc). 안건명·질의요지·회답·이유 + 질의/해석기관 추출. " +
    "PIPA 조문 적용 의문 시 법제처·부처가 회신한 공식 해석 직접 확인. 긴 이유는 자동 축약. " +
    "다음: search_interpretations로 유사 해석례, get_law_text로 인용 조문 확인.",
  inputSchema,

  async handler(args, client) {
    try {
      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "expc",
        type: "JSON",
        extraParams: { ID: args.id },
      });

      let parsed: { ExpcService?: InterpretationData; Law?: string };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return notFoundResponse(`법령해석례 응답 파싱 실패 (id=${args.id})`, [
          `search_interpretations(query="...") — 유효한 id 확인`,
        ]);
      }

      if (typeof parsed.Law === "string") {
        return notFoundResponse(`법령해석례 없음: ${parsed.Law}`, [
          `search_interpretations(query="...") — 유효한 id 확인`,
        ]);
      }

      const interp = parsed.ExpcService;
      if (!interp) {
        return notFoundResponse(`법령해석례 데이터 없음 (id=${args.id})`, [
          `search_interpretations(query="...") — 유효한 id 확인`,
        ]);
      }

      const title = interp.안건명 ?? "(안건명 없음)";

      let text = `=== ${title} ===\n`;
      if (interp.안건번호) text += `안건번호: ${interp.안건번호}\n`;
      if (interp.질의기관명) text += `질의기관: ${interp.질의기관명}\n`;
      if (interp.해석기관명) text += `회신기관: ${interp.해석기관명}\n`;
      if (interp.해석일자) text += `회신일: ${interp.해석일자}\n`;
      if (interp.법령해석례일련번호)
        text += `해석례ID: ${interp.법령해석례일련번호}\n`;

      // 핵심 본문 — 질의요지 → 회답 → 이유 순
      text += formatField("질의요지", interp.질의요지);
      text += formatField("회답", interp.회답);
      text += formatField("이유", interp.이유);

      text = appendSuggestions(text, [
        {
          tool: "search_interpretations",
          args: { query: title.slice(0, 20) },
          reason: "유사 법령해석례 검색",
        },
      ]);
      text += `\n📎 출처: 법령해석례 (id=${args.id}) — ${interpretationUrl(args.id)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_interpretation_text");
    }
  },
};
