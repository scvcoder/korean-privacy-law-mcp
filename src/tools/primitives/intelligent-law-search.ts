import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "자연어 검색 키워드. 법령명이 아니라 조문 본문·내용에서 검색. 예: '동의 없이 처리'"
    ),
  search: z
    .enum(["0", "1", "2", "3"])
    .default("0")
    .describe(
      "검색 도메인: 0=법령 조문 (기본), 1=법령 별표·서식, 2=행정규칙 조문, 3=행정규칙 별표·서식"
    ),
  display: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("결과 개수 (기본 20)"),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
});

interface AiSearchItem {
  법령ID?: string;
  법령명?: string;
  법령종류명?: string;
  소관부처명?: string;
  조문번호?: string;
  조문가지번호?: string;
  조문제목?: string;
  조문내용?: string;
  시행일자?: string;
}

const ITEM_TAG_BY_SEARCH: Record<string, string> = {
  "0": "법령조문",
  "1": "법령별표서식",
  "2": "행정규칙조문",
  "3": "행정규칙별표서식",
};

export const intelligentLawSearch: Tool<typeof inputSchema> = {
  name: "intelligent_law_search",
  description:
    "지능형 법령 검색 (법제처 lawSearch · target=aiSearch). 법령명이 아니라 조문 본문·내용에서 의미 기반 검색. " +
    "search_law는 법령명만 매칭하지만 이 도구는 조문 텍스트까지 검색 — 처리행위·키워드로 조문 발견. " +
    "search 파라미터로 도메인 선택 (법령 조문/별표, 행정규칙 조문/별표). " +
    "다음: get_law_text(mst)로 해당 법령 전체 본문 조회.",
  inputSchema,

  async handler(args, client) {
    try {
      const itemTag = ITEM_TAG_BY_SEARCH[args.search] ?? "법령조문";
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "aiSearch",
        extraParams: {
          query: args.query,
          search: args.search,
          display: String(args.display),
          page: String(args.page),
        },
      });

      const result = parseSearchXML<AiSearchItem>(
        xml,
        "aiSearch",
        itemTag,
        (itemXml) => ({
          법령ID: extractTag(itemXml, "법령ID"),
          법령명: extractTag(itemXml, "법령명"),
          법령종류명: extractTag(itemXml, "법령종류명"),
          소관부처명: extractTag(itemXml, "소관부처명"),
          조문번호: extractTag(itemXml, "조문번호"),
          조문가지번호: extractTag(itemXml, "조문가지번호"),
          조문제목: extractTag(itemXml, "조문제목"),
          조문내용: extractTag(itemXml, "조문내용"),
          시행일자: extractTag(itemXml, "시행일자"),
        }),
        // aiSearch endpoint quirk — totalCnt 대신 검색결과개수 사용
        { totalCntTag: "검색결과개수" }
      );

      if (result.totalCnt === 0) {
        return notFoundResponse(
          `의미 검색 결과 없음: "${args.query}" (search=${args.search})`,
          [
            `search_law(query="${args.query}") — 법령명 직접 검색`,
            `intelligent_law_search(query="${args.query}", search="2") — 행정규칙 조문 영역도 시도`,
          ]
        );
      }

      let text = `의미 검색 결과 — "${args.query}" (도메인: ${itemTag})\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시 (페이지 ${result.page})\n\n`;

      for (const item of result.items) {
        const lawName = item.법령명 ?? "(법령명 없음)";
        const articleNum = item.조문번호
          ? `제${item.조문번호}조${item.조문가지번호 ? `의${item.조문가지번호}` : ""}`
          : "";
        text += `[${item.법령ID ?? "-"}] ${lawName} ${articleNum}`;
        if (item.조문제목) text += ` — ${item.조문제목}`;
        text += "\n";
        if (item.법령종류명) text += `  종류: ${item.법령종류명}\n`;
        if (item.소관부처명) text += `  소관: ${item.소관부처명}\n`;
        if (item.시행일자) text += `  시행: ${item.시행일자}\n`;
        if (item.조문내용) {
          const snippet = item.조문내용.trim().slice(0, 200);
          text += `  내용: ${snippet}${item.조문내용.length > 200 ? "..." : ""}\n`;
        }
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem?.법령ID) {
        text = appendSuggestions(text, [
          {
            tool: "get_law_text",
            args: { lawId: firstItem.법령ID },
            reason: `${firstItem.법령명 ?? ""} 전체 본문 조회`,
          },
        ]);
      }
      if (firstItem?.법령명) {
        text += `\n${formatLawAttribution(firstItem.법령명)}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "intelligent_law_search");
    }
  },
};
