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
      "법령일련번호 (search_law·get_law_history 결과). 본법 mst (시행령·시행규칙 mst 아님)."
    ),
  knd: z
    .enum(["1", "2"])
    .default("2")
    .describe(
      "비교 종류: 1=인용조문 (법률↔하위법령 인용 관계), 2=위임조문 (법률→시행령 위임 관계, 기본)"
    ),
});

interface ArticleNode {
  조번호?: string;
  조가지번호?: string;
  조제목?: string;
  조내용?: string;
  법령명?: string;
  시행령조문?: ArticleNode | ArticleNode[];
  시행규칙조문?: ArticleNode | ArticleNode[];
}

interface BasicInfo {
  법령일련번호?: string;
  법령ID?: string;
  법령명?: string;
  시행일자?: string;
  공포일자?: string;
  공포번호?: string;
  삼단비교존재여부?: string;
}

function normalizeJoNum(jo?: string, branch?: string): string {
  if (!jo) return "?";
  const num = String(parseInt(jo, 10) || jo);
  const br = branch && branch !== "00" ? `의${parseInt(branch, 10)}` : "";
  return `제${num}조${br}`;
}

function formatNode(node: ArticleNode, prefix: string): string {
  const num = normalizeJoNum(node.조번호, node.조가지번호);
  const title = node.조제목 ? ` ${node.조제목}` : "";
  const law = node.법령명 ? `[${node.법령명}] ` : "";
  let out = `${prefix}${law}${num}${title}\n`;
  const content = (node.조내용 || "").trim();
  if (content) {
    const snippet = content.length > 300 ? content.slice(0, 300) + "..." : content;
    out += `${prefix}  ${snippet}\n`;
  }
  return out;
}

export const getThreeTier: Tool<typeof inputSchema> = {
  name: "get_three_tier",
  description:
    "법률 → 시행령 → 시행규칙 3단 위임·인용 비교 (법제처 lawService · target=thdCmp). " +
    "knd=2(위임, 기본): 본법 조문에서 시행령으로 위임된 관계. knd=1(인용): 법률·하위법령 간 인용 관계. " +
    "PIPA §29(안전조치) → 시행령 §30 같은 위임 매핑 한 번에 확인. " +
    "다음: get_law_text(mst)로 시행령 본문, get_admin_rule_text로 PIPC 고시 (W2.4).",
  inputSchema,

  async handler(args, client) {
    try {
      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "thdCmp",
        type: "JSON",
        extraParams: { MST: args.mst, knd: args.knd },
      });

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return notFoundResponse(`3단비교 응답 파싱 실패 (mst=${args.mst})`, [
          `get_law_history(lawName="...") — 유효한 mst 확인`,
        ]);
      }

      // knd quirk — root key 분기
      const rootKey =
        args.knd === "1" ? "ThdCmpLawXService" : "LspttnThdCmpLawXService";
      const articlesKey =
        args.knd === "1" ? "인용조문삼단비교" : "위임조문삼단비교";
      const kindLabel = args.knd === "1" ? "인용조문" : "위임조문";

      const root = parsed[rootKey] as
        | { 기본정보?: BasicInfo; [k: string]: unknown }
        | undefined;
      if (!root) {
        return notFoundResponse(
          `3단비교 데이터 없음 (mst=${args.mst}, knd=${args.knd})`,
          [`get_law_history(lawName="...") — 유효한 mst 확인`]
        );
      }

      const basic = root.기본정보 ?? {};
      const lawName = basic.법령명 ?? "(법령명 없음)";

      if (basic.삼단비교존재여부 === "N") {
        return notFoundResponse(
          `${lawName} 3단비교 없음 (knd=${args.knd}, 삼단비교존재여부=N)`,
          [`get_three_tier(mst="${args.mst}", knd="${args.knd === "1" ? "2" : "1"}") — 다른 종류 시도`]
        );
      }

      const tier = root[articlesKey] as
        | { 법률조문?: ArticleNode | ArticleNode[] }
        | undefined;
      const articles = asArray(tier?.법률조문);

      let text = `=== ${lawName} — 3단비교 (${kindLabel}) ===\n`;
      text += `mst: ${basic.법령일련번호} / lawId: ${basic.법령ID}\n`;
      text += `시행: ${basic.시행일자} · 공포: ${basic.공포일자}\n\n`;

      if (articles.length === 0) {
        text += "(법률 조문 데이터 없음)\n";
      } else {
        // 위임/인용이 있는 조문만 (시행령조문/시행규칙조문 키 보유)
        const withDelegation = articles.filter(
          (a) => a.시행령조문 || a.시행규칙조문
        );
        text += `법률 조문 ${articles.length}개 중 ${kindLabel} 관계 ${withDelegation.length}개:\n\n`;

        for (let i = 0; i < withDelegation.length; i++) {
          if (text.length > MAX_BODY_CHARS) {
            text += `⋯ ${withDelegation.length - i}개 더 (12,000자 한도) ⋯\n`;
            break;
          }
          const law = withDelegation[i]!;
          text += formatNode(law, "");

          const decree = asArray(law.시행령조문);
          for (const d of decree) {
            text += formatNode(d, "  └─ ");
          }
          const rule = asArray(law.시행규칙조문);
          for (const r of rule) {
            text += formatNode(r, "    └─ ");
          }
          text += "\n";
        }
      }

      text = appendSuggestions(text, [
        {
          tool: "get_law_text",
          args: { mst: args.mst },
          reason: `${lawName} 본법 전문`,
        },
        {
          tool: "get_three_tier",
          args: { mst: args.mst, knd: args.knd === "1" ? "2" : "1" },
          reason: args.knd === "1" ? "위임조문 비교 (knd=2)" : "인용조문 비교 (knd=1)",
        },
      ]);
      text += `\n${formatLawAttribution(lawName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_three_tier");
    }
  },
};
