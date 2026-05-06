import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, extractTagAll } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError, ValidationError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";

const MAX_BODY_CHARS = 12_000;

const inputSchema = z.object({
  mst: z
    .string()
    .min(1)
    .describe("법령일련번호 (search_english_law 결과의 mst=N). ID 파라미터는 작동 안 함"),
});

interface ArticleUnit {
  joNo: string; // "0001" 형태 — leading zero 제거 후 정수화
  joBrNo: string; // 조의N
  joYn: string; // "Y"=조문, "N"=챕터 헤더
  joTtl: string; // 조 제목
  joCts: string; // 본문
}

function parseJoUnits(joSection: string): ArticleUnit[] {
  const units: ArticleUnit[] = [];
  const blocks = extractTagAll(joSection, "Jo");
  for (const block of blocks) {
    units.push({
      joNo: extractTag(block, "joNo"),
      joBrNo: extractTag(block, "joBrNo"),
      joYn: extractTag(block, "joYn"),
      joTtl: extractTag(block, "joTtl"),
      joCts: extractTag(block, "joCts"),
    });
  }
  return units;
}

function normalizeNumber(n: string): string {
  return n.replace(/^0+/, "") || "0";
}

export const getEnglishLawText: Tool<typeof inputSchema> = {
  name: "get_english_law_text",
  description:
    "영문 법령 본문 (법제처 lawService · target=elaw). PIPA 영문본 등 챕터·조문(Article) 구조로 정렬. " +
    "GDPR 비교, 국외 보고·자문 작성에 직접 활용. " +
    "다음: get_law_text(mst)로 한글본 비교, compare_articles로 조문별 한↔영 비교(예정).",
  inputSchema,

  async handler(args, client) {
    try {
      if (!args.mst) {
        throw new ValidationError("mst 필수");
      }

      // elaw quirk — JSON 응답이 빈 응답(0바이트). XML만 작동.
      const xmlText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "elaw",
        type: "XML",
        extraParams: { MST: args.mst },
      });

      const lawContent = extractTag(xmlText, "Law");
      const infSection = extractTag(lawContent, "InfSection");

      // 실패 응답 패턴: <Law>일치하는 영문법령이 없습니다 ...</Law> (InfSection·JoSection 없음)
      if (!infSection) {
        const errorMsg = lawContent.includes("없습니다")
          ? lawContent
          : `영문 법령 데이터 없음 (mst=${args.mst})`;
        return notFoundResponse(`영문 법령 없음: ${errorMsg}`, [
          `search_english_law(query="...") — 유효한 mst 확인`,
        ]);
      }

      const lsId = extractTag(infSection, "lsId");
      const lsNmEng = extractTag(infSection, "lsNmEng");
      const ancYd = extractTag(infSection, "ancYd");
      const ancNo = extractTag(infSection, "ancNo");

      let text = `=== ${lsNmEng || "(English Title Missing)"} ===\n`;
      if (lsId) text += `Law ID: ${lsId}\n`;
      if (ancYd) text += `Promulgated: ${ancYd}`;
      if (ancNo) text += ` (No. ${ancNo})`;
      if (ancYd) text += "\n";
      text += "\n";

      const joSection = extractTag(lawContent, "JoSection");
      const units = parseJoUnits(joSection);

      if (units.length === 0) {
        text += "(No article data)\n";
      } else {
        const articles = units.filter((u) => u.joYn === "Y");
        const chapters = units.filter((u) => u.joYn === "N");
        text += `Articles: ${articles.length}, Chapter headings: ${chapters.length}\n\n`;

        let truncated = false;
        for (const unit of units) {
          if (text.length > MAX_BODY_CHARS) {
            const remaining = units.length - units.indexOf(unit);
            text += `\n⋯ ${remaining} more units omitted (12,000 char cap) ⋯\n`;
            truncated = true;
            break;
          }
          if (unit.joYn === "N") {
            text += `\n=== ${unit.joCts.trim()} ===\n`;
          } else {
            const num = normalizeNumber(unit.joNo);
            const branch = unit.joBrNo && unit.joBrNo !== "00" ? `-${normalizeNumber(unit.joBrNo)}` : "";
            const title = unit.joTtl ? ` (${unit.joTtl.trim()})` : "";
            text += `\n[Article ${num}${branch}]${title}\n${unit.joCts.trim()}\n`;
          }
        }
        if (truncated) {
          text += `\nUse get_law_text(mst="${args.mst}") for Korean version comparison.\n`;
        }
      }

      text = appendSuggestions(text, [
        {
          tool: "get_law_text",
          args: { mst: args.mst },
          reason: "한글 본문 비교 (조문별 매칭)",
        },
      ]);
      text += `\n📎 Source: Korea Law Information Center (mst=${args.mst})`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_english_law_text");
    }
  },
};
