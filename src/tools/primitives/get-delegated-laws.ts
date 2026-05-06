import { z } from "zod";
import type { Tool } from "../types.js";
import { asArray } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const MAX_BODY_CHARS = 12_000;

const inputSchema = z.object({
  lawId: z
    .string()
    .min(1)
    .describe(
      "법령ID (search_law의 lawId). 이 법령의 위임조문 관계 (조문 → 위임 받는 시행령·시행규칙 조문)."
    ),
});

interface BasicInfo {
  법령ID?: string;
  법령일련번호?: string;
  법령명?: string;
  시행일자?: string;
  공포일자?: string;
  공포번호?: string;
  소관부처?: { content?: string; 소관부처코드?: string } | string;
}

interface ChildArticle {
  조문번호?: string;
  조문가지번호?: string;
  조문제목?: string;
}

interface DelegatedArticleInfo {
  위임법령제목?: string;
  위임법령일련번호?: string;
  위임구분?: string;
  위임법령조문정보?: ChildArticle | ChildArticle[];
}

interface DelegationItem {
  위임정보?: DelegatedArticleInfo | DelegatedArticleInfo[];
  조정보?: ChildArticle;
}

function normalizeJoNum(jo?: string, branch?: string): string {
  if (!jo) return "?";
  const num = String(parseInt(jo, 10) || jo);
  const br = branch && branch !== "00" ? `의${parseInt(branch, 10)}` : "";
  return `제${num}조${br}`;
}

export const getDelegatedLaws: Tool<typeof inputSchema> = {
  name: "get_delegated_laws",
  description:
    "법령 위임조문 관계 (법제처 lawService · target=lsDelegated). " +
    "본법 조문 → 시행령·시행규칙 위임 조문 매핑을 평탄 list로 반환. " +
    "PIPA 같은 본법의 모든 위임조문 한 번에 확인 (예: 59개 위임조문). " +
    "다음: get_law_text(lawId)로 위임받는 시행령 본문, get_three_tier(mst)로 트리 시각화.",
  inputSchema,

  async handler(args, client) {
    try {
      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "lsDelegated",
        type: "JSON",
        extraParams: { ID: args.lawId },
      });

      // 빈 응답 (잘못된 ID)
      if (!jsonText.trim()) {
        return notFoundResponse(`위임조문 데이터 없음 (lawId=${args.lawId})`, [
          `search_law(query="...") — 유효한 lawId 확인`,
        ]);
      }

      let parsed: { lsDelegated?: { 법령?: { 법령정보?: BasicInfo; 위임조문정보?: DelegationItem | DelegationItem[] } } };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return notFoundResponse(`위임조문 응답 파싱 실패 (lawId=${args.lawId})`, [
          `search_law(query="...") — 유효한 lawId 확인`,
        ]);
      }

      const law = parsed.lsDelegated?.법령;
      if (!law) {
        return notFoundResponse(`위임조문 데이터 없음 (lawId=${args.lawId})`, [
          `search_law(query="...") — 유효한 lawId 확인`,
        ]);
      }

      const info = law.법령정보 ?? {};
      const lawName = info.법령명 ?? "(법령명 없음)";
      const items = asArray(law.위임조문정보);

      let text = `=== ${lawName} 위임조문 ===\n`;
      if (info.법령ID) text += `lawId: ${info.법령ID}`;
      if (info.법령일련번호) text += ` / mst: ${info.법령일련번호}`;
      text += "\n";
      const ministry =
        typeof info.소관부처 === "string"
          ? info.소관부처
          : info.소관부처?.content;
      if (ministry) text += `소관: ${ministry}\n`;
      if (info.시행일자) text += `시행: ${info.시행일자}\n`;
      text += `\n위임조문 ${items.length}건:\n\n`;

      if (items.length === 0) {
        text += "(이 법령에 위임조문 데이터 없음 — 시행령·시행규칙으로 위임된 조문이 없거나 미등록)\n";
      } else {
        for (let i = 0; i < items.length; i++) {
          if (text.length > MAX_BODY_CHARS) {
            text += `⋯ ${items.length - i}개 더 (12,000자 한도) ⋯\n`;
            break;
          }
          const item = items[i]!;
          const parent = item.조정보 ?? {};
          const parentJo = normalizeJoNum(parent.조문번호, parent.조문가지번호);
          const parentTitle = parent.조문제목 ? ` ${parent.조문제목}` : "";
          text += `[${parentJo}${parentTitle}]\n`;

          const delegations = asArray(item.위임정보);
          for (const d of delegations) {
            const childArticles = asArray(d.위임법령조문정보);
            for (const ch of childArticles) {
              const childJo = normalizeJoNum(ch.조문번호, ch.조문가지번호);
              const childTitle = ch.조문제목 ? ` ${ch.조문제목}` : "";
              const targetLaw = d.위임법령제목 ?? "(위임법령 없음)";
              const kind = d.위임구분 ? ` (${d.위임구분})` : "";
              text += `  └─ [${targetLaw}] ${childJo}${childTitle}${kind}\n`;
            }
            // 자식 조문 정보가 없는 경우라도 위임법령 자체는 표시
            if (childArticles.length === 0 && d.위임법령제목) {
              const kind = d.위임구분 ? ` (${d.위임구분})` : "";
              text += `  └─ ${d.위임법령제목}${kind}\n`;
            }
          }
          text += "\n";
        }
      }

      const firstDeleg = asArray(items[0]?.위임정보)[0];
      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [];
      if (firstDeleg?.위임법령일련번호) {
        suggestions.push({
          tool: "get_law_text",
          args: { mst: firstDeleg.위임법령일련번호 },
          reason: `${firstDeleg.위임법령제목} 본문`,
        });
      }
      if (info.법령일련번호) {
        suggestions.push({
          tool: "get_three_tier",
          args: { mst: info.법령일련번호, knd: "2" },
          reason: "위임관계 시각 트리 (3단비교)",
        });
      }
      if (suggestions.length > 0) {
        text = appendSuggestions(text, suggestions);
      }
      text += `\n${formatLawAttribution(lawName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_delegated_laws");
    }
  },
};
