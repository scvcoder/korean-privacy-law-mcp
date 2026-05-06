import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, extractTagAll } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";

const inputSchema = z.object({
  lawId: z
    .string()
    .min(1)
    .describe("법령ID (search_law의 lawId 필드 — 법령일련번호 mst와 다름)"),
  jo: z
    .string()
    .optional()
    .describe(
      "조문번호 — '제15조' 또는 '15' 또는 6자리 코드 '001500' 모두 수용. 미지정 시 전체 조문."
    ),
  fromRegDt: z
    .string()
    .regex(/^\d{8}$/, "YYYYMMDD 형식")
    .optional()
    .describe("조회 시작일 YYYYMMDD (미지정 시 자동 — 10년 전부터)"),
  toRegDt: z
    .string()
    .regex(/^\d{8}$/, "YYYYMMDD 형식")
    .optional()
    .describe("조회 종료일 YYYYMMDD (미지정 시 자동 — 오늘)"),
});

interface JoHistoryItem {
  조문번호: string;
  변경사유: string;
  조문개정일: string;
  조문시행일: string;
}

interface LawHistoryEntry {
  법령일련번호: string;
  법령명한글: string;
  공포일자: string;
  공포번호: string;
  제개정구분명: string;
  시행일자: string;
  조문이력: JoHistoryItem[];
}

/** "제15조" / "15" / "001500" → 6자리 정규화. 의 분기 처리 ("제24조의2" → "002402"). */
function normalizeJoCode(input: string): string {
  const cleaned = input.trim();
  // 이미 6자리 숫자
  if (/^\d{6}$/.test(cleaned)) return cleaned;
  // "제N조" 또는 "제N조의M"
  const m = cleaned.match(/^제?(\d+)조?(?:의(\d+))?$/);
  if (m && m[1]) {
    const main = m[1].padStart(4, "0");
    const branch = (m[2] ?? "0").padStart(2, "0");
    return main + branch;
  }
  // 그 외는 그대로 (API에 그대로 전달)
  return cleaned;
}

/** "001500" → "제15조", "002402" → "제24조의2" */
function denormalizeJoCode(code: string): string {
  if (!/^\d{6}$/.test(code)) return code;
  const main = parseInt(code.substring(0, 4), 10);
  const branch = parseInt(code.substring(4, 6), 10);
  return branch === 0 ? `제${main}조` : `제${main}조의${branch}`;
}

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const yyyy = String(now.getFullYear()).padStart(4, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const to = `${yyyy}${mm}${dd}`;
  const from = `${parseInt(yyyy, 10) - 10}0101`;
  return { from, to };
}

export const getArticleChangeHistory: Tool<typeof inputSchema> = {
  name: "get_article_change_history",
  description:
    "조문별 변경 이력 (법제처 lawSearch · target=lsJoHstInf). 특정 법령(또는 특정 조문)의 시점별 개정 추적. " +
    "fromRegDt/toRegDt 날짜 범위 필수 (미지정 시 최근 10년 자동). " +
    "PIPA 같은 자주 개정되는 법령의 조문 단위 히스토리 추적. " +
    "다음: get_historical_law(mst)로 그 시점 본문, compare_old_new로 신구 비교.",
  inputSchema,

  async handler(args, client) {
    try {
      const { from, to } = defaultDateRange();
      const fromRegDt = args.fromRegDt ?? from;
      const toRegDt = args.toRegDt ?? to;

      const extraParams: Record<string, string> = {
        ID: args.lawId,
        fromRegDt,
        toRegDt,
        display: "100",
      };
      if (args.jo) extraParams.JO = normalizeJoCode(args.jo);

      const xml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "lsJoHstInf",
        extraParams,
      });

      const totalCnt = parseInt(extractTag(xml, "totalCnt"), 10) || 0;
      if (totalCnt === 0) {
        const joNote = args.jo ? ` · jo=${normalizeJoCode(args.jo)}` : "";
        return notFoundResponse(
          `조문 변경 이력 없음 (lawId=${args.lawId}${joNote}, ${fromRegDt}~${toRegDt})`,
          [
            `get_law_history(lawName="...") — 법령 자체의 연혁 목록`,
            `날짜 범위 확장: fromRegDt를 더 이른 날짜로 (예: 19900101)`,
          ]
        );
      }

      const lawBlocks = extractTagAll(xml, "law");
      const entries: LawHistoryEntry[] = [];
      for (const block of lawBlocks) {
        const infoXml = extractTag(block, "법령정보");
        const articlesXml = extractTag(block, "조문정보");
        if (!infoXml) continue;

        const joBlocks = extractTagAll(articlesXml, "jo");
        const items: JoHistoryItem[] = joBlocks.map((j) => ({
          조문번호: extractTag(j, "조문번호"),
          변경사유: extractTag(j, "변경사유"),
          조문개정일: extractTag(j, "조문개정일"),
          조문시행일: extractTag(j, "조문시행일"),
        }));

        entries.push({
          법령일련번호: extractTag(infoXml, "법령일련번호"),
          법령명한글: extractTag(infoXml, "법령명한글"),
          공포일자: extractTag(infoXml, "공포일자"),
          공포번호: extractTag(infoXml, "공포번호"),
          제개정구분명: extractTag(infoXml, "제개정구분명"),
          시행일자: extractTag(infoXml, "시행일자"),
          조문이력: items,
        });
      }

      // 시행일자 desc 정렬
      entries.sort((a, b) => b.시행일자.localeCompare(a.시행일자));

      const lawName = entries[0]?.법령명한글 ?? "(법령명 없음)";
      const joLabel = args.jo
        ? ` · ${denormalizeJoCode(normalizeJoCode(args.jo))}`
        : "";
      let text = `=== ${lawName} 조문 변경 이력${joLabel} ===\n`;
      text += `총 ${entries.length}개 시점 (${fromRegDt} ~ ${toRegDt})\n\n`;

      for (const entry of entries) {
        text += `[mst=${entry.법령일련번호}] ${entry.시행일자} 시행 · ${entry.제개정구분명}`;
        if (entry.공포번호) text += ` (공포 ${entry.공포일자}, 제${entry.공포번호}호)`;
        text += "\n";
        if (entry.조문이력.length > 0) {
          for (const j of entry.조문이력.slice(0, 10)) {
            text += `  ${denormalizeJoCode(j.조문번호)}: ${j.변경사유}`;
            if (j.조문시행일 && j.조문시행일 !== entry.시행일자) {
              text += ` (조문 시행 ${j.조문시행일})`;
            }
            text += "\n";
          }
          if (entry.조문이력.length > 10) {
            text += `  ⋯ ${entry.조문이력.length - 10}개 조문 더 ⋯\n`;
          }
        }
        text += "\n";
      }

      // 첫 시점 mst로 본문 조회 추천
      const recent = entries[0];
      if (recent) {
        text = appendSuggestions(text, [
          {
            tool: "get_historical_law",
            args: { mst: recent.법령일련번호 },
            reason: `${recent.시행일자} 시점 본문`,
          },
          {
            tool: "compare_old_new",
            args: { mst: recent.법령일련번호 },
            reason: "직전 시점과 신구법 비교",
          },
        ]);
      }
      text += `\n📎 출처: ${lawName} 조문 변경 이력 (법제처 DB)`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_article_change_history");
    }
  },
};
