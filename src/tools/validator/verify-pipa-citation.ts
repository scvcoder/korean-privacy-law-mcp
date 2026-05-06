import { z } from "zod";
import type { Tool } from "../types.js";
import {
  parseCitation,
  type ParsedCitation,
  formatJoCode,
} from "../../lib/citations.js";
import { resolveLawAlias } from "../../lib/aliases.js";
import { asArray, extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { hallucinationDetectedResponse } from "../../lib/not-found.js";
import { formatToolError, ValidationError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";
import type { LawApiClient } from "../../client/law-api-client.js";

const inputSchema = z.object({
  citation: z
    .string()
    .min(1)
    .describe(
      "검증할 인용 문자열. 다양한 약식 수용 — " +
        "'PIPA §15 ① 6호', '개인정보 보호법 제15조제1항제6호', '정통망법 §22', " +
        "'안전성 확보조치 기준 제5조' 등. " +
        "법령명 약칭(개보법·정통망법·통비법 등)은 PRIVACY_ALIASES로 자동 정규화."
    ),
  as_of: z
    .string()
    .regex(/^\d{8}$/)
    .optional()
    .describe(
      "시점 YYYYMMDD (선택). 지정 시 그 시점 본문 기준 검증. " +
        "예: '20190601' = 2019.6.1 시점에 정통망법 §22 유효 여부."
    ),
});

interface ArticleUnit {
  조문번호?: string;
  조문가지번호?: string;
  조문제목?: string;
  조문내용?: string;
  조문여부?: string;
  항?: HangItem | HangItem[];
}

interface HangItem {
  항번호?: string;
  항내용?: string;
  호?: HoItem | HoItem[];
}

interface HoItem {
  호번호?: string;
  호내용?: string;
  목?: SubItem | SubItem[];
}

interface SubItem {
  목번호?: string;
  목내용?: string;
}

interface LawData {
  기본정보?: {
    법령명_한글?: string;
    법령명한글?: string;
    공포일자?: string;
    시행일자?: string;
    최종시행일자?: string;
    법령ID?: string;
    법령일련번호?: string;
  };
  조문?: { 조문단위?: ArticleUnit | ArticleUnit[] };
}

interface SearchHit {
  법령일련번호: string;
  법령명한글: string;
  법령ID: string;
  현행연혁코드: string;
  시행일자: string;
}

/** 약칭 사전 + lsAbrv quirk 회피 — 우선 도메인 사전, 매칭 없으면 입력 그대로. */
function resolveLaw(name: string): string {
  return resolveLawAlias(name);
}

/** 법령 검색 — 첫 매칭의 mst·lawId·시행일 반환. */
async function searchLaw(
  client: LawApiClient,
  lawName: string
): Promise<SearchHit | null> {
  const xml = await client.fetchApi({
    endpoint: "lawSearch.do",
    target: "law",
    extraParams: { query: lawName, display: "100" },
  });
  const result = parseSearchXML<SearchHit>(xml, "LawSearch", "law", (item) => ({
    법령일련번호: extractTag(item, "법령일련번호"),
    법령명한글: extractTag(item, "법령명한글"),
    법령ID: extractTag(item, "법령ID"),
    현행연혁코드: extractTag(item, "현행연혁코드"),
    시행일자: extractTag(item, "시행일자"),
  }));
  if (result.totalCnt === 0 || result.items.length === 0) return null;
  // 정확 매칭 우선
  const exact = result.items.find((h) => h.법령명한글 === lawName);
  return exact ?? result.items[0]!;
}

/** lawService.do · target=law · JO=6자리 — 조문 단위 fetch. */
async function fetchArticle(
  client: LawApiClient,
  mst: string,
  joParam: string,
  efYd?: string
): Promise<ArticleUnit | null> {
  const extraParams: Record<string, string> = { MST: mst, JO: joParam };
  if (efYd) extraParams.efYd = efYd;
  const json = await client.fetchApi({
    endpoint: "lawService.do",
    target: "law",
    type: "JSON",
    extraParams,
  });
  let parsed: { 법령?: LawData | string };
  try {
    parsed = JSON.parse(json) as { 법령?: LawData | string };
  } catch {
    return null;
  }
  if (typeof parsed.법령 === "string" || !parsed.법령) return null;
  const units = asArray(parsed.법령.조문?.조문단위).filter(
    (u): u is ArticleUnit => u !== undefined && u !== null
  );
  return units.find((u) => u.조문여부 === "조문") ?? null;
}

function joParamFromCode(jo: number, branch: number): string {
  const main = String(jo).padStart(4, "0");
  const sub = String(branch).padStart(2, "0");
  return main + sub;
}

/** "① ", "②" 같은 항번호에서 정수 추출. */
function hangNum(s: string | undefined): number | null {
  if (!s) return null;
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  for (let i = 0; i < circled.length; i++) {
    if (s.includes(circled[i]!)) return i + 1;
  }
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1]!, 10) : null;
}

/** "1." 같은 호번호에서 정수 추출. */
function hoNum(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1]!, 10) : null;
}

interface VerifyStep {
  ok: boolean;
  level: "law" | "article" | "hang" | "ho" | "mok";
  message: string;
  detail?: string;
}

export const verifyPipaCitation: Tool<typeof inputSchema> = {
  name: "verify_pipa_citation",
  description:
    "법령 인용 환각 검증 (4계층: 법령 존재 → 조문 존재 → 항 존재 → 호·목 존재). " +
    "법제처 API에 실제 존재하는지 사실 검증 — LLM이 못 하는 도구 핵심 가치. " +
    "예: 'PIPA §9999' → 조문 없음 [HALLUCINATION_DETECTED] / 'PIPA §15 ① 6호' → ✓ 모든 단계 검증. " +
    "as_of 지정 시 시점 기준 검증 (정통망법 §22 폐지 여부 등). " +
    "법령명 약칭(PIPA·개보법·정통망법 등) PRIVACY_ALIASES 자동 정규화. " +
    "환각 발견 시 [HALLUCINATION_DETECTED] 마커 + 정확한 근거 + 다음 도구 안내 자동. " +
    "다음: search_law(법령명)으로 정식명, get_law_text(mst)로 본문 직접 확인.",
  inputSchema,

  async handler(args, client) {
    try {
      const parsed = parseCitation(args.citation);
      if (!parsed) {
        throw new ValidationError(
          `인용 파싱 실패: "${args.citation}". 'PIPA §15' 또는 '개인정보 보호법 제15조' 형식 사용.`
        );
      }

      const steps: VerifyStep[] = [];
      const resolved = resolveLaw(parsed.lawName);
      const isAliasResolved = resolved !== parsed.lawName;

      // 1단계: 법령 존재
      const hit = await searchLaw(client, resolved);
      if (!hit) {
        steps.push({
          ok: false,
          level: "law",
          message: `법령 없음: 「${resolved}」`,
          detail: `법제처 검색 결과 0건${isAliasResolved ? ` (입력 "${parsed.lawName}" → "${resolved}" 약칭 변환)` : ""}`,
        });
        return formatResult(args.citation, parsed, resolved, steps, args.as_of, null, null, null);
      }
      steps.push({
        ok: true,
        level: "law",
        message: `법령 존재: 「${hit.법령명한글}」`,
        detail: `mst=${hit.법령일련번호}, lawId=${hit.법령ID}, 시행 ${hit.시행일자}, 현행연혁=${hit.현행연혁코드}`,
      });

      // 2단계: 조문 존재
      const joParam = joParamFromCode(parsed.joCode.jo, parsed.joCode.jo_branch ?? 0);
      const article = await fetchArticle(client, hit.법령일련번호, joParam, args.as_of);
      if (!article) {
        steps.push({
          ok: false,
          level: "article",
          message: `조문 없음: 제${parsed.joCode.jo}조${parsed.joCode.jo_branch ? `의${parsed.joCode.jo_branch}` : ""}`,
          detail: `${hit.법령명한글}에 해당 조문이 존재하지 않음 (시점 기준)`,
        });
        return formatResult(args.citation, parsed, resolved, steps, args.as_of, hit, null, null);
      }
      const articleTitle = article.조문제목 ?? "(제목 없음)";

      // 삭제 감지 — 본문 또는 제목이 "삭제 <YYYY.M.D>" 형태이거나 제목 없고 본문만 "삭제"
      // 예: "제22조 삭제 <2020.2.4>" — 조문번호는 남아 있지만 본문은 폐지된 빈 껍데기
      const articleContent = (article.조문내용 ?? "").trim();
      const articleHasContent = asArray(article.항).length > 0;
      const deletedRe = /^(?:제\d+조(?:의\d+)?\s*)?삭제\s*(<[^>]+>)?\s*$/;
      const isDeleted =
        deletedRe.test(articleContent) ||
        deletedRe.test(article.조문제목 ?? "") ||
        (!articleHasContent && /삭제/.test(articleContent));
      if (isDeleted) {
        const deletionMark = articleContent.match(/<[^>]+>/)?.[0] ?? "";
        steps.push({
          ok: false,
          level: "article",
          message: `조문 폐지(삭제)됨: 제${article.조문번호}조${article.조문가지번호 ? `의${article.조문가지번호}` : ""} ${deletionMark}`.trim(),
          detail: articleContent || `${hit.법령명한글}의 해당 조문은 삭제 처리되어 본문 없음`,
        });
        return formatResult(args.citation, parsed, resolved, steps, args.as_of, hit, article, null);
      }

      steps.push({
        ok: true,
        level: "article",
        message: `조문 존재: 제${article.조문번호}조${article.조문가지번호 ? `의${article.조문가지번호}` : ""} (${articleTitle})`,
      });

      // 3단계: 항 존재 (선택)
      let matchedHang: HangItem | null = null;
      if (parsed.joCode.hang !== undefined) {
        const hangs = asArray(article.항).filter(
          (h): h is HangItem => h !== undefined && h !== null
        );
        const target = parsed.joCode.hang;
        matchedHang = hangs.find((h) => hangNum(h.항번호) === target) ?? null;
        if (!matchedHang) {
          steps.push({
            ok: false,
            level: "hang",
            message: `제${target}항 없음`,
            detail: `해당 조문에 ${hangs.length}개 항만 존재 (요청 제${target}항)`,
          });
          return formatResult(args.citation, parsed, resolved, steps, args.as_of, hit, article, null);
        }
        const preview = (matchedHang.항내용 ?? "").trim().slice(0, 100);
        steps.push({
          ok: true,
          level: "hang",
          message: `제${target}항 존재`,
          detail: preview,
        });
      }

      // 4단계: 호 존재 (선택, 항이 검증된 후)
      let matchedHo: HoItem | null = null;
      if (parsed.joCode.ho !== undefined && matchedHang) {
        const hos = asArray(matchedHang.호).filter(
          (h): h is HoItem => h !== undefined && h !== null
        );
        const target = parsed.joCode.ho;
        matchedHo = hos.find((h) => hoNum(h.호번호) === target) ?? null;
        if (!matchedHo) {
          steps.push({
            ok: false,
            level: "ho",
            message: `제${target}호 없음`,
            detail: `해당 항에 ${hos.length}개 호만 존재 (요청 제${target}호)`,
          });
          return formatResult(args.citation, parsed, resolved, steps, args.as_of, hit, article, matchedHang);
        }
        const preview = (matchedHo.호내용 ?? "").trim().slice(0, 120);
        steps.push({
          ok: true,
          level: "ho",
          message: `제${target}호 존재`,
          detail: preview,
        });
      }

      // 5단계: 목 존재 (선택)
      if (parsed.joCode.mok !== undefined && matchedHo) {
        const moks = asArray(matchedHo.목).filter(
          (m): m is SubItem => m !== undefined && m !== null
        );
        const target = parsed.joCode.mok;
        const found = moks.find((m) => (m.목번호 ?? "").includes(target));
        if (!found) {
          steps.push({
            ok: false,
            level: "mok",
            message: `${target}목 없음`,
            detail: `해당 호에 ${moks.length}개 목만 존재`,
          });
        } else {
          const preview = (found.목내용 ?? "").trim().slice(0, 120);
          steps.push({ ok: true, level: "mok", message: `${target}목 존재`, detail: preview });
        }
      }

      return formatResult(args.citation, parsed, resolved, steps, args.as_of, hit, article, matchedHang);
    } catch (err) {
      return formatToolError(err, "verify_pipa_citation");
    }
  },
};

function formatResult(
  inputCitation: string,
  parsed: ParsedCitation,
  resolvedLawName: string,
  steps: VerifyStep[],
  asOf: string | undefined,
  hit: SearchHit | null,
  article: ArticleUnit | null,
  _matchedHang: HangItem | null
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  const allOk = steps.every((s) => s.ok);
  const _ = _matchedHang; // unused
  void _;

  if (!allOk) {
    // 환각 감지 — [HALLUCINATION_DETECTED]
    let evidence = `입력: "${inputCitation}"\n`;
    evidence += `정규화: 「${resolvedLawName}」 ${formatJoCode(parsed.joCode)}\n`;
    if (asOf) evidence += `시점: ${asOf}\n`;
    evidence += `\n검증 단계:\n`;
    for (const s of steps) {
      const mark = s.ok ? "✓" : "✗";
      evidence += `  ${mark} ${s.message}\n`;
      if (s.detail) evidence += `    ${s.detail}\n`;
    }
    evidence += `\n이어서 시도할 수 있는 조회:\n`;
    if (!hit) {
      evidence += `  • search_law(query="${resolvedLawName}") — 정식 법령명 확인\n`;
      evidence += `  • intelligent_law_search(query="${parsed.lawName}") — 의미 검색\n`;
    } else {
      evidence += `  • get_law_text(mst="${hit.법령일련번호}") — 전체 본문 확인\n`;
      if (article) {
        evidence += `  • get_law_tree(mst="${hit.법령일련번호}") — 조문 구조 navigation\n`;
      }
    }
    return hallucinationDetectedResponse(inputCitation, evidence.trim());
  }

  // 모두 ✓
  let text = `✅ 인용 검증 성공\n\n`;
  text += `입력: "${inputCitation}"\n`;
  text += `정규화: 「${resolvedLawName}」 ${formatJoCode(parsed.joCode)}\n`;
  if (asOf) text += `시점: ${asOf}\n`;
  text += `\n검증 단계 (4계층):\n`;
  for (const s of steps) {
    text += `  ✓ ${s.message}\n`;
    if (s.detail) text += `    ${s.detail}\n`;
  }

  if (hit) {
    text = appendSuggestions(text, [
      {
        tool: "get_law_text",
        args: { mst: hit.법령일련번호 },
        reason: `${hit.법령명한글} 전체 본문`,
      },
      {
        tool: "compare_articles",
        args: {
          left: { mst: hit.법령일련번호, jo: formatJoCode({ jo: parsed.joCode.jo, ...(parsed.joCode.jo_branch !== undefined ? { jo_branch: parsed.joCode.jo_branch } : {}) }) },
          right: { mst: hit.법령일련번호, jo: formatJoCode({ jo: parsed.joCode.jo, ...(parsed.joCode.jo_branch !== undefined ? { jo_branch: parsed.joCode.jo_branch } : {}) }) },
        },
        reason: "조문 정밀 조회",
      },
    ]);
    text += `\n${formatLawAttribution(hit.법령명한글, formatJoCode({ jo: parsed.joCode.jo, ...(parsed.joCode.jo_branch !== undefined ? { jo_branch: parsed.joCode.jo_branch } : {}) }))}`;
  }
  return { content: [{ type: "text", text }] };
}
