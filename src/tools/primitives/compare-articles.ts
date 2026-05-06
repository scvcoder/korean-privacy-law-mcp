import { z } from "zod";
import type { Tool } from "../types.js";
import { asArray } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError, ValidationError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";
import { toJoParam } from "../../lib/citations.js";
import type { LawApiClient } from "../../client/law-api-client.js";

const MAX_PER_SIDE_CHARS = 6_000;

const sideSchema = z.object({
  mst: z
    .string()
    .min(1)
    .describe("법령일련번호 — search_law 결과의 [mst=N]"),
  jo: z
    .string()
    .min(1)
    .describe(
      "조문 — '제15조', '제28조의2' 같은 한글 표현 또는 6자리 JO코드('001500'). " +
        "1~4자리 숫자만 줄 경우 가지번호 0으로 간주."
    ),
  efYd: z
    .string()
    .regex(/^\d{8}$/)
    .optional()
    .describe("시행일 YYYYMMDD (시점별 본문 조회용, 미지정 시 현행)"),
});

const inputSchema = z.object({
  left: sideSchema.describe("첫 번째 조문"),
  right: sideSchema.describe("두 번째 조문"),
});

interface SubItem {
  목번호?: string;
  목내용?: string;
}

interface HoItem {
  호번호?: string;
  호내용?: string;
  목?: SubItem | SubItem[];
}

interface HangItem {
  항번호?: string;
  항내용?: string;
  호?: HoItem | HoItem[];
}

interface ArticleUnit {
  조문번호?: string;
  조문가지번호?: string;
  조문제목?: string;
  조문내용?: string;
  조문여부?: string;
  항?: HangItem | HangItem[];
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

interface FetchedSide {
  lawName: string;
  lawId: string;
  efYd: string;
  article: ArticleUnit;
  joParam: string;
  mst: string;
}

async function fetchSide(
  side: z.infer<typeof sideSchema>,
  client: LawApiClient,
  label: string
): Promise<FetchedSide> {
  const joParam = toJoParam(side.jo);
  if (!joParam) {
    throw new ValidationError(
      `[${label}] jo 파싱 실패: "${side.jo}" — '제15조' 또는 '001500' 형식 사용`
    );
  }

  const extraParams: Record<string, string> = {
    MST: side.mst,
    JO: joParam,
  };
  if (side.efYd) extraParams.efYd = side.efYd;

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
    throw new ValidationError(
      `[${label}] 법제처 응답 파싱 실패 (mst=${side.mst}, jo=${joParam})`
    );
  }

  // API 실패 응답: { "Law": "일치하는 법령이 없습니다." }
  if (typeof parsed.법령 === "string") {
    throw new ValidationError(
      `[${label}] 법령 없음 (mst=${side.mst}): ${parsed.법령}`
    );
  }
  if (!parsed.법령) {
    throw new ValidationError(`[${label}] 법령 데이터 없음 (mst=${side.mst})`);
  }

  const law = parsed.법령;
  const info = law.기본정보 ?? {};
  const lawName = info.법령명_한글 ?? info.법령명한글 ?? "(법령명 없음)";
  const lawId = info.법령ID ?? "";
  const efYd = info.시행일자 ?? info.최종시행일자 ?? "";

  const units = asArray(law.조문?.조문단위).filter(
    (u): u is ArticleUnit => u !== undefined && u !== null
  );
  const article = units.find((u) => u.조문여부 === "조문");
  if (!article) {
    throw new ValidationError(
      `[${label}] 조문 없음 (mst=${side.mst}, jo=${joParam}) — 조문번호가 존재하지 않을 수 있음`
    );
  }

  return { lawName, lawId, efYd, article, joParam, mst: side.mst };
}

function renderArticle(article: ArticleUnit): string {
  const num = article.조문번호 ?? "?";
  const branch = article.조문가지번호 ? `의${article.조문가지번호}` : "";
  const title = article.조문제목 ? ` (${article.조문제목})` : "";
  let s = `[제${num}조${branch}]${title}\n`;

  // 조문내용은 보통 "제15조(개인정보의 수집ㆍ이용)" 헤더 한 줄 — 이미 위에서 표시했으므로 생략
  // 항·호·목만 렌더
  const hangs = asArray(article.항).filter(
    (h): h is HangItem => h !== undefined && h !== null
  );
  if (hangs.length === 0 && article.조문내용) {
    // 항이 없는 단순 조문: 조문내용에 본문이 들어가는 케이스
    const body = article.조문내용.split("\n").slice(1).join("\n").trim();
    if (body) s += `${body}\n`;
  }
  for (const hang of hangs) {
    if (hang.항내용) s += `${hang.항내용.trim()}\n`;
    const hos = asArray(hang.호).filter(
      (h): h is HoItem => h !== undefined && h !== null
    );
    for (const ho of hos) {
      if (ho.호내용) s += `  ${ho.호내용.trim()}\n`;
      const moks = asArray(ho.목).filter(
        (m): m is SubItem => m !== undefined && m !== null
      );
      for (const mok of moks) {
        if (mok.목내용) s += `    ${mok.목내용.trim()}\n`;
      }
    }
  }
  return s;
}

function articleLabel(article: ArticleUnit): string {
  const num = article.조문번호 ?? "?";
  const branch = article.조문가지번호 ? `의${article.조문가지번호}` : "";
  return `제${num}조${branch}`;
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n⋯ ${s.length - max}자 생략 (한도 ${max}) ⋯\n`;
}

export const compareArticles: Tool<typeof inputSchema> = {
  name: "compare_articles",
  description:
    "두 법령 조문을 side-by-side로 비교 (내부에서 lawService · target=law · JO 두 번 호출). " +
    "PIPA §15 vs 신용정보법 §32, PIPA §17 vs §18 등 조문 단위 차이 분석에 활용. " +
    "각 사이드는 mst+jo 필수, efYd로 시점 지정 가능. " +
    "diff 자동 추출 X — LLM이 두 본문을 직접 비교해 차이점 정리. " +
    "각 사이드 6,000자 절단. 다음: get_law_text(mst)로 전문, search_law(query)로 mst 발견.",
  inputSchema,

  async handler(args, client) {
    try {
      // 두 사이드 병렬 호출. 한쪽이라도 실패하면 [NOT_FOUND] 반환.
      const [leftRes, rightRes] = await Promise.allSettled([
        fetchSide(args.left, client, "left"),
        fetchSide(args.right, client, "right"),
      ]);

      if (leftRes.status === "rejected" || rightRes.status === "rejected") {
        const reasons: string[] = [];
        if (leftRes.status === "rejected") {
          const msg =
            leftRes.reason instanceof Error
              ? leftRes.reason.message
              : String(leftRes.reason);
          reasons.push(`left: ${msg}`);
        }
        if (rightRes.status === "rejected") {
          const msg =
            rightRes.reason instanceof Error
              ? rightRes.reason.message
              : String(rightRes.reason);
          reasons.push(`right: ${msg}`);
        }
        return notFoundResponse(`조문 비교 실패: ${reasons.join(" / ")}`, [
          `search_law(query="...") — 유효한 mst 확인`,
          `get_law_text(mst="...") — 전체 조문 목록에서 jo 확인`,
        ]);
      }

      const left = leftRes.value;
      const right = rightRes.value;

      const leftLabel = articleLabel(left.article);
      const rightLabel = articleLabel(right.article);

      let text = `=== 조문 비교 ===\n\n`;
      text += `📋 [LEFT]  ${left.lawName} ${leftLabel}`;
      if (left.efYd) text += ` (시행 ${left.efYd})`;
      text += `\n${"-".repeat(60)}\n`;
      text += clip(renderArticle(left.article), MAX_PER_SIDE_CHARS);

      text += `\n${"-".repeat(60)}\n\n`;
      text += `📋 [RIGHT] ${right.lawName} ${rightLabel}`;
      if (right.efYd) text += ` (시행 ${right.efYd})`;
      text += `\n${"-".repeat(60)}\n`;
      text += clip(renderArticle(right.article), MAX_PER_SIDE_CHARS);
      text += `\n${"-".repeat(60)}\n`;

      text += `\n💡 두 조문의 차이점은 LLM이 직접 정리. 자동 diff 미제공.\n`;

      text = appendSuggestions(text, [
        {
          tool: "get_law_text",
          args: { mst: left.mst },
          reason: `${left.lawName} 전문 (${leftLabel} 외 조문)`,
        },
        {
          tool: "get_law_text",
          args: { mst: right.mst },
          reason: `${right.lawName} 전문 (${rightLabel} 외 조문)`,
        },
      ]);
      text += `\n${formatLawAttribution(left.lawName, leftLabel)}`;
      text += `\n${formatLawAttribution(right.lawName, rightLabel)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "compare_articles");
    }
  },
};
