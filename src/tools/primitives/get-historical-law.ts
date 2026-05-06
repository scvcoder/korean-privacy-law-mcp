import { z } from "zod";
import type { Tool } from "../types.js";
import { asArray } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const MAX_BODY_CHARS = 12_000;

const inputSchema = z.object({
  mst: z
    .string()
    .min(1)
    .describe(
      "특정 시점의 법령일련번호 (get_law_history 결과의 시점별 mst). " +
        "현행 mst를 줘도 작동하지만 의미상 get_law_text 권장."
    ),
});

interface ArticleUnit {
  조문번호?: string;
  조문가지번호?: string;
  조문제목?: string;
  조문내용?: string;
  조문여부?: string;
}

interface LawData {
  기본정보?: {
    법령명_한글?: string;
    법령명한글?: string;
    공포일자?: string;
    시행일자?: string;
    최종시행일자?: string;
    제개정구분명?: string;
    제개정구분?: string;
    소관부처?: { content?: string } | string;
    소관부처명?: string;
  };
  조문?: { 조문단위?: ArticleUnit | ArticleUnit[] };
}

export const getHistoricalLaw: Tool<typeof inputSchema> = {
  name: "get_historical_law",
  description:
    "특정 시점 법령 본문 (법제처 lawService · target=law). get_law_history가 반환한 시점별 mst로 호출. " +
    "PIPA 같이 자주 개정되는 법령의 과거 시점 검토(예: 2019년 시점, 2023년 통합 직전) 시 사용. " +
    "현행 본문은 get_law_text. 다음: get_law_history(lawName)로 다른 시점 mst 확인.",
  inputSchema,

  async handler(args, client) {
    try {
      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "law",
        type: "JSON",
        extraParams: { MST: args.mst },
      });

      let parsed: { 법령?: LawData };
      try {
        parsed = JSON.parse(jsonText) as { 법령?: LawData };
      } catch {
        return notFoundResponse(
          `법령 본문 응답 파싱 실패 (mst=${args.mst})`,
          [`get_law_history(lawName="...") — 유효한 mst 확인`]
        );
      }

      const law = parsed.법령;
      if (!law) {
        return notFoundResponse(`법령 데이터 없음 (mst=${args.mst})`, [
          `get_law_history(lawName="...") — 유효한 mst 확인`,
        ]);
      }

      const info = law.기본정보 ?? {};
      const lawName = info.법령명_한글 ?? info.법령명한글 ?? "(법령명 없음)";
      const effDate = info.시행일자 ?? info.최종시행일자 ?? "?";
      const ancDate = info.공포일자 ?? "?";
      const revType = info.제개정구분명 ?? info.제개정구분 ?? "";

      let text = `=== ${lawName} (시행 ${effDate}) ===\n`;
      text += `mst: ${args.mst}\n`;
      text += `공포일: ${ancDate}`;
      if (revType) text += ` · ${revType}`;
      text += "\n";
      const ministry =
        typeof info.소관부처 === "string"
          ? info.소관부처
          : info.소관부처?.content ?? info.소관부처명;
      if (ministry) text += `소관: ${ministry}\n`;
      text += "\n";

      const units = asArray(law.조문?.조문단위).filter(
        (u): u is ArticleUnit => u !== undefined && u !== null
      );
      const articles = units.filter((u) => u.조문여부 === "조문");

      if (articles.length === 0) {
        text += "(조문 데이터 없음 — 부칙·별표만 존재할 수 있음)\n";
      } else {
        text += `이 시점 조문 ${articles.length}개:\n\n`;
        for (let i = 0; i < articles.length; i++) {
          const article = articles[i]!;
          const num = article.조문번호 ?? "?";
          const branch = article.조문가지번호 ? `의${article.조문가지번호}` : "";
          const title = article.조문제목 ? ` (${article.조문제목})` : "";
          text += `[제${num}조${branch}]${title}\n`;
          if (article.조문내용) text += `${article.조문내용.trim()}\n`;
          text += "\n";
          if (text.length > MAX_BODY_CHARS) {
            const remaining = articles.length - i - 1;
            if (remaining > 0) {
              text += `⋯ ${remaining}개 조문 생략 (12,000자 한도) ⋯\n`;
            }
            break;
          }
        }
      }

      text = appendSuggestions(text, [
        {
          tool: "get_law_history",
          args: { lawName },
          reason: `${lawName}의 다른 시점 mst 목록`,
        },
      ]);
      text += `\n${formatLawAttribution(lawName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_historical_law");
    }
  },
};
