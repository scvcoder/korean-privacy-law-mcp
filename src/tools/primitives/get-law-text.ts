import { z } from "zod";
import type { Tool } from "../types.js";
import { asArray } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError, ValidationError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const MAX_BODY_CHARS = 12_000;

const inputSchema = z
  .object({
    mst: z
      .string()
      .optional()
      .describe("법령일련번호 (search_law 결과의 [브래킷] 안 숫자)"),
    lawId: z.string().optional().describe("법령ID (mst와 택1)"),
    efYd: z
      .string()
      .regex(/^\d{8}$/)
      .optional()
      .describe("시행일자 YYYYMMDD (시점별 본문 조회용, 미지정 시 현행)"),
  })
  .refine((d) => d.mst || d.lawId, {
    message: "mst 또는 lawId 중 하나는 필수입니다",
  });

interface ArticleUnit {
  조문번호?: string;
  조문가지번호?: string;
  조문제목?: string;
  조문내용?: string;
  조문여부?: string;
  항?: unknown;
}

interface LawData {
  기본정보?: {
    법령명_한글?: string;
    법령명한글?: string;
    공포일자?: string;
    시행일자?: string;
    최종시행일자?: string;
    소관부처?: { content?: string } | string;
  };
  조문?: { 조문단위?: ArticleUnit | ArticleUnit[] };
  부칙?: unknown;
}

export const getLawText: Tool<typeof inputSchema> = {
  name: "get_law_text",
  description:
    "법령 본문 조회 (법제처 lawService · target=law). mst(또는 lawId)로 법령 전체 본문 가져옴. " +
    "조문 단위로 정렬된 결과 반환. 시점 본문은 efYd=YYYYMMDD. " +
    "큰 법령은 12,000자에서 잘림 (특정 조문은 v1.1의 get_law_article 사용). " +
    "다음: get_related_laws(lawId)로 관계, get_law_history(lawId)로 개정 이력.",
  inputSchema,

  async handler(args, client) {
    try {
      if (!args.mst && !args.lawId) {
        throw new ValidationError("mst 또는 lawId 필수");
      }

      const extraParams: Record<string, string> = {};
      if (args.mst) extraParams.MST = args.mst;
      if (args.lawId) extraParams.ID = args.lawId;
      if (args.efYd) extraParams.efYd = args.efYd;

      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "law",
        type: "JSON",
        extraParams,
      });

      let parsed: { 법령?: LawData };
      try {
        parsed = JSON.parse(jsonText) as { 법령?: LawData };
      } catch {
        return notFoundResponse(
          `법령 본문 응답을 파싱할 수 없음 (mst=${args.mst ?? "-"}, lawId=${
            args.lawId ?? "-"
          })`,
          [`search_law(query="...") — 유효한 mst를 다시 확인`]
        );
      }

      const law = parsed.법령;
      if (!law) {
        return notFoundResponse(
          `법령 데이터 없음 (mst=${args.mst ?? "-"}, lawId=${args.lawId ?? "-"})`,
          [`search_law(query="...") — 유효한 mst 확인`]
        );
      }

      const info = law.기본정보 ?? {};
      const lawName =
        info.법령명_한글 ?? info.법령명한글 ?? "(법령명 없음)";

      let text = `=== ${lawName} ===\n`;
      if (info.공포일자) text += `공포: ${info.공포일자}\n`;
      if (info.시행일자 || info.최종시행일자)
        text += `시행: ${info.시행일자 ?? info.최종시행일자}\n`;

      const ministry =
        typeof info.소관부처 === "string"
          ? info.소관부처
          : info.소관부처?.content;
      if (ministry) text += `소관: ${ministry}\n`;
      text += "\n";

      const units = asArray(law.조문?.조문단위).filter(
        (u): u is ArticleUnit => u !== undefined && u !== null
      );

      const articles = units.filter((u) => u.조문여부 === "조문");
      if (articles.length === 0) {
        text += "(조문 데이터 없음 — 부칙·별표만 존재할 수 있음)\n";
      } else {
        text += `조문 ${articles.length}개:\n\n`;
        for (const article of articles) {
          const num = article.조문번호 ?? "?";
          const branch = article.조문가지번호 ? `의${article.조문가지번호}` : "";
          const title = article.조문제목 ? ` (${article.조문제목})` : "";
          text += `[제${num}조${branch}]${title}\n`;
          if (article.조문내용) {
            text += `${article.조문내용.trim()}\n`;
          }
          text += "\n";
          if (text.length > MAX_BODY_CHARS) {
            const remaining = articles.length - articles.indexOf(article) - 1;
            text +=
              remaining > 0
                ? `...\n⋯ ${remaining}개 조문 생략 (12,000자 한도) — v1.1의 get_law_article로 특정 조문 조회 ⋯\n`
                : "";
            break;
          }
        }
      }

      const relatedArgs: { mst?: string; lawId?: string } = {};
      if (args.mst) relatedArgs.mst = args.mst;
      else if (args.lawId) relatedArgs.lawId = args.lawId;

      text = appendSuggestions(text, [
        {
          tool: "get_related_laws",
          args: relatedArgs,
          reason: `${lawName} 시행령·시행규칙·고시 등 하위 규칙`,
        },
        {
          tool: "get_annexes",
          args: { lawName },
          reason: "별표·서식 조회",
        },
      ]);
      text += `\n${formatLawAttribution(lawName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_law_text");
    }
  },
};
