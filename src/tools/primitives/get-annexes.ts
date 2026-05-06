import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { resolveLawAlias } from "../../lib/aliases.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const inputSchema = z.object({
  lawName: z
    .string()
    .min(1)
    .describe("법령명 (약칭 가능). 별표·서식의 소속 법령."),
  knd: z
    .enum(["1", "2", "3", "4", "5"])
    .default("5")
    .describe("종류: 1=별표, 2=서식, 3=부칙별표, 4=부칙서식, 5=전체 (기본)"),
  display: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100)
    .describe("결과 개수 (기본 100)"),
});

interface AnnexItem {
  별표일련번호: string;
  관련법령일련번호: string;
  관련법령ID: string;
  별표번호: string;
  별표명: string;
  별표종류: string;
  관련법령명: string;
  공포일자: string;
  법령종류: string;
  별표서식파일링크: string;
  별표서식PDF파일링크: string;
}

export const getAnnexes: Tool<typeof inputSchema> = {
  name: "get_annexes",
  description:
    "법령 별표·서식 목록 (법제처 lawSearch · target=licbyl). " +
    "처리방침·동의서 같은 표준양식이 별표·서식에 위치. knd로 종류 필터(별표/서식/부칙). " +
    "응답에는 별표일련번호·관련법령ID·PDF 링크 포함 (PDF 본문 추출은 v1.1). " +
    "다음: get_law_text(lawId=관련법령ID)로 본문 맥락, search_admin_rule로 행정규칙 별표(W2).",
  inputSchema,

  async handler(args, client) {
    try {
      const resolvedLawName = resolveLawAlias(args.lawName);
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "licbyl",
        extraParams: {
          query: resolvedLawName,
          search: "2", // 해당법령으로 검색 (검증된 lawByl quirk)
          knd: args.knd,
          display: String(args.display),
        },
      });

      const result = parseSearchXML<AnnexItem>(
        xml,
        "licBylSearch",
        "licbyl",
        (itemXml) => ({
          별표일련번호: extractTag(itemXml, "별표일련번호"),
          관련법령일련번호: extractTag(itemXml, "관련법령일련번호"),
          관련법령ID: extractTag(itemXml, "관련법령ID"),
          별표번호: extractTag(itemXml, "별표번호"),
          별표명: extractTag(itemXml, "별표명"),
          별표종류: extractTag(itemXml, "별표종류"),
          관련법령명: extractTag(itemXml, "관련법령명"),
          공포일자: extractTag(itemXml, "공포일자"),
          법령종류: extractTag(itemXml, "법령종류"),
          별표서식파일링크: extractTag(itemXml, "별표서식파일링크"),
          별표서식PDF파일링크: extractTag(itemXml, "별표서식PDF파일링크"),
        })
      );

      const aliasNote =
        resolvedLawName !== args.lawName ? ` (정규화: "${resolvedLawName}")` : "";

      if (result.totalCnt === 0) {
        return notFoundResponse(
          `별표·서식 없음: "${args.lawName}"${aliasNote} (knd=${args.knd})`,
          [
            `get_annexes(lawName="${args.lawName}", knd="5") — 전체 종류 조회`,
            `search_law(query="${args.lawName}") — 법령명 정확성 확인`,
          ]
        );
      }

      let text = `별표·서식 — ${args.lawName}${aliasNote}\n`;
      text += `총 ${result.totalCnt}건 중 ${result.items.length}건 표시\n\n`;

      for (const item of result.items) {
        // 별표번호는 "000100" 형태 — 앞 0 제거하여 가독성 ("100" → "1")
        const numNormalized = item.별표번호.replace(/^0+/, "") || "0";
        const kind = item.별표종류 ? `[${item.별표종류}] ` : "";
        text += `${kind}별표${numNormalized}: ${item.별표명 || "(이름 없음)"}\n`;
        if (item.관련법령명) text += `  법령: ${item.관련법령명}`;
        if (item.법령종류) text += ` (${item.법령종류})`;
        text += "\n";
        if (item.관련법령ID) text += `  법령ID: ${item.관련법령ID}\n`;
        if (item.공포일자) text += `  공포: ${item.공포일자}\n`;
        const link = item.별표서식PDF파일링크 || item.별표서식파일링크;
        if (link) text += `  파일: https://www.law.go.kr${link}\n`;
        text += "\n";
      }

      const firstItem = result.items[0];
      if (firstItem) {
        const sugs: Array<{
          tool: string;
          args: Record<string, unknown>;
          reason: string;
        }> = [];
        if (firstItem.관련법령ID) {
          sugs.push({
            tool: "get_law_text",
            args: { lawId: firstItem.관련법령ID },
            reason: `${firstItem.관련법령명 || resolvedLawName} 본문 맥락 확인`,
          });
        }
        if (sugs.length) text = appendSuggestions(text, sugs);
      }
      text += `\n${formatLawAttribution(resolvedLawName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_annexes");
    }
  },
};
