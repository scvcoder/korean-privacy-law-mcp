import { z } from "zod";
import type { Tool } from "../types.js";
import { asArray } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError, ValidationError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const inputSchema = z
  .object({
    mst: z.string().optional().describe("법령일련번호 (search_law 결과의 [mst=N])"),
    lawId: z.string().optional().describe("법령ID (mst와 택1)"),
    efYd: z
      .string()
      .regex(/^\d{8}$/)
      .optional()
      .describe("시행일 YYYYMMDD (시점별 트리 조회용)"),
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
}

interface LawData {
  기본정보?: {
    법령명_한글?: string;
    법령명한글?: string;
    공포일자?: string;
    시행일자?: string;
    최종시행일자?: string;
    법령ID?: string;
  };
  조문?: { 조문단위?: ArticleUnit | ArticleUnit[] };
}

interface Header {
  /** 1=편, 2=장, 3=절, 4=관 */
  depth: number;
  /** "제1장 총칙" 같은 트리밍된 제목 */
  title: string;
  /** 헤더가 시작되는 첫 조문번호 */
  startNum: number;
  startBranch: number;
  /** 다음 헤더 직전의 마지막 조문(조문여부=조문) — 없으면 startNum/startBranch와 동일 */
  endNum: number;
  endBranch: number;
  /** 이 섹션에 포함된 실제 조문 개수 */
  articleCount: number;
}

// `\b` (word boundary) 사용 금지 — 한글은 non-word char라 경계 매칭 실패.
// prefix만 검사 (제목 대부분 "제N장 " 형태로 공백 따라옴).
const DEPTH_PREFIXES: Array<{ pattern: RegExp; depth: number }> = [
  { pattern: /^제\d+편(?:\s|의|$)/, depth: 1 },
  { pattern: /^제\d+장(?:\s|의|$)/, depth: 2 },
  { pattern: /^제\d+절(?:\s|의|$)/, depth: 3 },
  { pattern: /^제\d+관(?:\s|의|$)/, depth: 4 },
];

function inferDepth(title: string): number | null {
  for (const { pattern, depth } of DEPTH_PREFIXES) {
    if (pattern.test(title)) return depth;
  }
  return null;
}

function articleLabel(num: number, branch: number): string {
  return branch > 0 ? `제${num}조의${branch}` : `제${num}조`;
}

function parseInt0(s: string | undefined): number {
  return parseInt(s ?? "", 10) || 0;
}

/**
 * units 배열을 단일 패스로 순회하며 헤더와 그 사이 조문 정보를 수집.
 * - 헤더(조문여부=전문, 제목 prefix 매칭) → Header 항목 신규 생성
 * - 조문(조문여부=조문) → 직전 헤더의 articleCount/endNum/endBranch 갱신
 * 헤더 prefix가 안 맞는 "전문" 단위(예: 부칙 머리글)는 스킵.
 */
function buildHeaders(units: ArticleUnit[]): Header[] {
  const headers: Header[] = [];

  for (const u of units) {
    const yn = u.조문여부;
    const content = (u.조문내용 ?? "").trim();
    const num = parseInt0(u.조문번호);
    const branch = parseInt0(u.조문가지번호);

    if (yn === "전문") {
      const depth = inferDepth(content);
      if (depth === null) continue;
      headers.push({
        depth,
        title: content,
        startNum: num,
        startBranch: branch,
        endNum: num,
        endBranch: branch,
        articleCount: 0,
      });
    } else if (yn === "조문" && headers.length > 0) {
      const last = headers[headers.length - 1];
      if (last) {
        last.articleCount += 1;
        last.endNum = num;
        last.endBranch = branch;
      }
    }
  }

  return headers;
}

function indent(depth: number): string {
  // depth 1=편 → 0칸, 2=장 → 0칸 (편이 없으면 장이 최상위), 3=절 → 3칸, 4=관 → 6칸
  // 한국 법령은 보통 편 없이 장 최상위라 depth 2를 baseline으로.
  if (depth <= 2) return "";
  return "│  ".repeat(depth - 2);
}

function treeMarker(isLast: boolean): string {
  return isLast ? "└─" : "├─";
}

export const getLawTree: Tool<typeof inputSchema> = {
  name: "get_law_tree",
  description:
    "법령 내부 편·장·절·관 목차 트리 (lawService · target=law JSON, '조문여부=전문' 헤더 추출). " +
    "PIPA 같은 대형 법령(126조+)에서 LLM 네비게이션 보조용 — 어느 장·절을 봐야 할지 빠른 결정. " +
    "각 헤더의 조문 범위([제N조~제M조]) + 조문 개수 표시. " +
    "get_law_text(전체 본문, 12K cap)와 다름: 본문 X 구조만. get_law_system_tree(법-시행령-시행규칙 체계도)와도 다름. " +
    "다음: get_law_text(mst)로 전문, compare_articles(mst, jo)로 특정 조문 정밀 조회.",
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

      let parsed: { 법령?: LawData | string };
      try {
        parsed = JSON.parse(jsonText) as { 법령?: LawData | string };
      } catch {
        return notFoundResponse(
          `법령 본문 응답 파싱 실패 (mst=${args.mst ?? "-"}, lawId=${args.lawId ?? "-"})`,
          [`search_law(query="...") — 유효한 mst 다시 확인`]
        );
      }

      // API 실패 응답: { "Law": "일치하는 법령이 없습니다." }
      if (typeof parsed.법령 === "string") {
        return notFoundResponse(
          `법령 없음: ${parsed.법령} (mst=${args.mst ?? "-"}, lawId=${args.lawId ?? "-"})`,
          [`search_law(query="...") — 유효한 mst 확인`]
        );
      }
      if (!parsed.법령) {
        return notFoundResponse(
          `법령 데이터 없음 (mst=${args.mst ?? "-"}, lawId=${args.lawId ?? "-"})`,
          [`search_law(query="...") — 유효한 mst 확인`]
        );
      }

      const law = parsed.법령;
      const info = law.기본정보 ?? {};
      const lawName = info.법령명_한글 ?? info.법령명한글 ?? "(법령명 없음)";
      const lawId = info.법령ID ?? args.lawId ?? "";

      const units = asArray(law.조문?.조문단위).filter(
        (u): u is ArticleUnit => u !== undefined && u !== null
      );
      const totalArticles = units.filter((u) => u.조문여부 === "조문").length;
      const headers = buildHeaders(units);

      if (headers.length === 0) {
        return notFoundResponse(
          `편·장·절 헤더 없음 (mst=${args.mst ?? "-"}). 작은 법령은 헤더 없이 조문만 존재할 수 있음.`,
          [
            `get_law_text(mst="${args.mst ?? ""}") — 전체 본문 직접 조회`,
            `get_three_tier(mst="${args.mst ?? ""}") — 법-시행령-시행규칙 체계`,
          ]
        );
      }

      let text = `=== ${lawName} — 목차 트리 ===\n`;
      const promulg = info.공포일자 ? `공포 ${info.공포일자}` : "";
      const enforce = info.시행일자 || info.최종시행일자;
      const meta: string[] = [];
      if (promulg) meta.push(promulg);
      if (enforce) meta.push(`시행 ${enforce}`);
      if (args.mst) meta.push(`mst=${args.mst}`);
      if (lawId) meta.push(`lawId=${lawId}`);
      if (meta.length > 0) text += meta.join(" · ") + "\n";

      const headerCount = headers.length;
      const depthCounts = new Map<number, number>();
      for (const h of headers) {
        depthCounts.set(h.depth, (depthCounts.get(h.depth) ?? 0) + 1);
      }
      const depthLabel = (d: number): string =>
        d === 1 ? "편" : d === 2 ? "장" : d === 3 ? "절" : "관";
      const depthSummary = [...depthCounts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([d, c]) => `${depthLabel(d)} ${c}`)
        .join(" + ");
      text += `\n📜 헤더 ${headerCount}개 (${depthSummary}) · 조문 ${totalArticles}개\n\n`;

      // 트리 렌더 — 같은 depth 헤더가 마지막인지 판단해서 └─/├─ 결정
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;
        // 같은 depth의 다음 헤더가 있는가?
        let nextSameDepthIdx = -1;
        for (let j = i + 1; j < headers.length; j++) {
          const nh = headers[j];
          if (!nh) continue;
          if (nh.depth < h.depth) break;
          if (nh.depth === h.depth) {
            nextSameDepthIdx = j;
            break;
          }
        }
        const isLast = nextSameDepthIdx === -1;
        const startLabel = articleLabel(h.startNum, h.startBranch);
        const endLabel = articleLabel(h.endNum, h.endBranch);
        const range =
          h.startNum === h.endNum && h.startBranch === h.endBranch
            ? `[${startLabel}]`
            : `[${startLabel} ~ ${endLabel}]`;
        text += `${indent(h.depth)}${treeMarker(isLast)} ${h.title} ${range} (${h.articleCount}조)\n`;
      }

      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [];
      const ref: { mst?: string; lawId?: string } = {};
      if (args.mst) ref.mst = args.mst;
      else if (args.lawId) ref.lawId = args.lawId;

      suggestions.push({
        tool: "get_law_text",
        args: ref,
        reason: `${lawName} 전체 본문 (12,000자 cap)`,
      });
      // 첫 헤더의 첫 조문을 compare_articles 예시로
      const firstHeader = headers[0];
      if (firstHeader && args.mst) {
        const jo = articleLabel(firstHeader.startNum, firstHeader.startBranch);
        suggestions.push({
          tool: "compare_articles",
          args: {
            left: { mst: args.mst, jo },
            right: { mst: args.mst, jo },
          },
          reason: `특정 조문 정밀 조회 (예: ${jo})`,
        });
      }
      text = appendSuggestions(text, suggestions);
      text += `\n${formatLawAttribution(lawName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_law_tree");
    }
  },
};
