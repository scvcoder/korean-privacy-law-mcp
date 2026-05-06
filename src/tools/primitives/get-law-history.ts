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
    .describe(
      "법령명 (정확 매칭, 약칭 가능). 같은 이름의 모든 시행일 버전 (현행·연혁·시행예정) 반환."
    ),
  display: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100)
    .describe("결과 개수 (기본 100, 한 법령의 모든 연혁 회수에 충분)"),
});

interface HistoryItem {
  법령일련번호: string;
  법령ID: string;
  법령명한글: string;
  공포일자: string;
  공포번호: string;
  시행일자: string;
  현행연혁코드: string;
  제개정구분명: string;
  소관부처명: string;
}

export const getLawHistory: Tool<typeof inputSchema> = {
  name: "get_law_history",
  description:
    "법령 연혁 목록 (법제처 lawSearch · target=eflaw). 한 법령의 시행일별 모든 버전 반환 — 현행·연혁·시행예정 구분. " +
    "각 버전마다 mst·공포일·시행일·제개정구분 노출 → get_historical_law(mst)로 그 시점 본문 조회. " +
    "PIPA 같은 자주 개정되는 법령의 시점 분기 추적에 필수. " +
    "다음: get_historical_law(mst)로 특정 시점 본문, compare_old_new로 신구 비교.",
  inputSchema,

  async handler(args, client) {
    try {
      const resolvedLawName = resolveLawAlias(args.lawName);
      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "eflaw",
        extraParams: {
          query: resolvedLawName,
          display: String(args.display),
        },
      });

      const result = parseSearchXML<HistoryItem>(
        xml,
        "LawSearch",
        "law",
        (itemXml) => ({
          법령일련번호: extractTag(itemXml, "법령일련번호"),
          법령ID: extractTag(itemXml, "법령ID"),
          법령명한글: extractTag(itemXml, "법령명한글"),
          공포일자: extractTag(itemXml, "공포일자"),
          공포번호: extractTag(itemXml, "공포번호"),
          시행일자: extractTag(itemXml, "시행일자"),
          현행연혁코드: extractTag(itemXml, "현행연혁코드"),
          제개정구분명: extractTag(itemXml, "제개정구분명"),
          소관부처명: extractTag(itemXml, "소관부처명"),
        })
      );

      // eflaw quirk — query 부분 매칭이라 다른 법령(예: 개인정보 보호법 시행령)도 들어옴.
      // 클라이언트에서 정확 매칭 필터링.
      const exactMatches = result.items.filter(
        (item) => item.법령명한글.trim() === resolvedLawName.trim()
      );

      const aliasNote =
        resolvedLawName !== args.lawName ? ` (정규화: "${resolvedLawName}")` : "";

      if (exactMatches.length === 0) {
        return notFoundResponse(
          `법령 연혁 없음: "${args.lawName}"${aliasNote} (전체 검색 ${result.totalCnt}건 중 정확 매칭 0건)`,
          [
            `search_law(query="${args.lawName}") — 법령명 정확성 확인`,
          ]
        );
      }

      // 시행일자 내림차순 정렬 (최신 → 과거)
      exactMatches.sort((a, b) => b.시행일자.localeCompare(a.시행일자));

      let text = `=== ${resolvedLawName} 연혁 ===\n`;
      text += `총 ${exactMatches.length}건 (${result.totalCnt}건 중 정확 매칭${aliasNote})\n\n`;

      for (const item of exactMatches) {
        const status = item.현행연혁코드 || "?";
        text += `[mst=${item.법령일련번호}] 시행 ${item.시행일자} · ${status}`;
        if (item.제개정구분명) text += ` · ${item.제개정구분명}`;
        text += "\n";
        text += `  공포: ${item.공포일자}`;
        if (item.공포번호) text += ` (제${item.공포번호}호)`;
        text += "\n";
        if (item.소관부처명) text += `  소관: ${item.소관부처명}\n`;
        text += "\n";
      }

      // 핵심 시점 추천 (현행 + 가장 오래된 + 중간 변화)
      const current = exactMatches.find((i) => i.현행연혁코드 === "현행");
      const oldest = exactMatches[exactMatches.length - 1];
      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [];
      if (current) {
        suggestions.push({
          tool: "get_historical_law",
          args: { mst: current.법령일련번호 },
          reason: `현행 (${current.시행일자}) 본문`,
        });
      }
      if (oldest && oldest !== current) {
        suggestions.push({
          tool: "get_historical_law",
          args: { mst: oldest.법령일련번호 },
          reason: `최초 시점 (${oldest.시행일자}) 본문 — 변화 추적`,
        });
      }
      if (suggestions.length > 0) {
        text = appendSuggestions(text, suggestions);
      }
      text += `\n${formatLawAttribution(resolvedLawName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_law_history");
    }
  },
};
