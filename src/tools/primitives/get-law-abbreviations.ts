import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { resolveLawAlias } from "../../lib/aliases.js";
import type { LawApiClient } from "../../client/law-api-client.js";

const inputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "약칭 또는 정식 법령명 키워드 (부분 매칭, 양방향). " +
        "예: '정통망법' → 정식명 조회, '개인정보 보호법' → 약칭 조회. " +
        "미지정 시 등록 순으로 N건 덤프."
    ),
  exact: z
    .boolean()
    .default(false)
    .describe("정확 매칭 여부 (기본 false: 부분 매칭)"),
  display: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("결과 개수 (기본 20, 최대 100). 클라이언트 측 절단."),
  stdDt: z
    .string()
    .regex(/^\d{8}$/)
    .optional()
    .describe("등록일 시작 YYYYMMDD (서버측 필터, 캐시 무시)"),
  endDt: z
    .string()
    .regex(/^\d{8}$/)
    .optional()
    .describe("등록일 종료 YYYYMMDD (서버측 필터, 캐시 무시)"),
  bypassCache: z
    .boolean()
    .default(false)
    .describe("모듈 캐시 무시 강제 갱신"),
});

interface AbbrItem {
  법령일련번호: string;
  법령명한글: string;
  법령약칭명: string;
  법령ID: string;
  시행일자: string;
  공포일자: string;
  소관부처명: string;
  법령구분명: string;
  현행연혁코드: string;
  등록일: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
let CACHE: { items: AbbrItem[]; loadedAt: number } | null = null;

async function fetchAll(
  client: LawApiClient,
  options: { stdDt?: string; endDt?: string }
): Promise<AbbrItem[]> {
  const extraParams: Record<string, string> = {};
  if (options.stdDt) extraParams.stdDt = options.stdDt;
  if (options.endDt) extraParams.endDt = options.endDt;

  const xml = await client.fetchApi({
    endpoint: "lawSearch.do",
    target: "lsAbrv",
    type: "XML",
    extraParams,
    timeoutMs: 60_000, // 응답 1.2MB+ 여유
  });

  const result = parseSearchXML<AbbrItem>(
    xml,
    "LawSearch",
    "law",
    (itemXml) => ({
      법령일련번호: extractTag(itemXml, "법령일련번호"),
      법령명한글: extractTag(itemXml, "법령명한글"),
      법령약칭명: extractTag(itemXml, "법령약칭명"),
      법령ID: extractTag(itemXml, "법령ID"),
      시행일자: extractTag(itemXml, "시행일자"),
      공포일자: extractTag(itemXml, "공포일자"),
      소관부처명: extractTag(itemXml, "소관부처명"),
      법령구분명: extractTag(itemXml, "법령구분명"),
      현행연혁코드: extractTag(itemXml, "현행연혁코드"),
      등록일: extractTag(itemXml, "등록일"),
    })
  );
  return result.items;
}

function matches(item: AbbrItem, query: string, exact: boolean): boolean {
  const q = query.trim();
  if (q.length === 0) return true;
  const name = item.법령명한글;
  const abbr = item.법령약칭명;
  if (exact) {
    return name === q || abbr === q;
  }
  return name.includes(q) || abbr.includes(q);
}

export const getLawAbbreviations: Tool<typeof inputSchema> = {
  name: "get_law_abbreviations",
  description:
    "법령 약칭 사전 (법제처 lawSearch · target=lsAbrv). " +
    "법제처가 등록한 전체 약칭 매핑(약 2,600건)에서 query로 부분 매칭. " +
    "도메인 약칭(`정통망법`·`개보법` 등 lsAbrv 미등록) → PRIVACY_ALIASES로 자동 변환 후 검색. " +
    "예: '정통망법' → 도메인 변환 → 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 매칭. " +
    "'개인정보 보호법' → 정식명만 사용 (lsAbrv는 약칭 없는 법령 미수록). " +
    "약칭 → 정식명 / 정식명 → 약칭 양방향. " +
    "응답 1.2MB+ 가져와 모듈 캐시(24h) 사용 — bypassCache=true로 강제 갱신. " +
    "stdDt/endDt 지정 시 서버측 필터 (캐시 무시). " +
    "다음: get_law_text(mst)로 본문, search_law(query)로 정식 검색.",
  inputSchema,

  async handler(args, client) {
    try {
      const useCache =
        !args.stdDt && !args.endDt && !args.bypassCache;

      let items: AbbrItem[];
      let cacheUsed = false;

      if (useCache && CACHE && Date.now() - CACHE.loadedAt < CACHE_TTL_MS) {
        items = CACHE.items;
        cacheUsed = true;
      } else {
        const fetchOpts: { stdDt?: string; endDt?: string } = {};
        if (args.stdDt) fetchOpts.stdDt = args.stdDt;
        if (args.endDt) fetchOpts.endDt = args.endDt;
        items = await fetchAll(client, fetchOpts);
        if (useCache) {
          CACHE = { items, loadedAt: Date.now() };
        }
      }

      // 도메인 약칭 fallback — '정통망법' → '정보통신망 이용촉진 및 정보보호 등에 관한 법률'
      // PRIVACY_ALIASES에 등록된 입력만 변환 (lsAbrv 미등록 약칭 보완).
      const resolvedQuery = args.query ? resolveLawAlias(args.query) : undefined;
      const aliasResolved = resolvedQuery !== undefined && resolvedQuery !== args.query;

      const total = items.length;
      const filtered = resolvedQuery
        ? items.filter((it) => matches(it, resolvedQuery, args.exact))
        : items;

      if (filtered.length === 0) {
        const queryNote = aliasResolved
          ? `"${args.query}" → "${resolvedQuery}" (도메인 약칭 변환)`
          : `"${args.query}"`;
        return notFoundResponse(
          args.query
            ? `법령 약칭 매칭 없음: ${queryNote} (전체 ${total}건 중 0건)`
            : `법령 약칭 사전 비어 있음 (등록일 ${args.stdDt ?? "?"}~${args.endDt ?? "?"})`,
          [
            `search_law(query="${args.query ?? ""}") — 정식명·내용 검색 (PRIVACY_ALIASES fallback 포함)`,
            `intelligent_law_search(query="${args.query ?? ""}") — 의미 검색`,
          ]
        );
      }

      const sliced = filtered.slice(0, args.display);

      let text = `법령 약칭 사전`;
      if (args.query) {
        text += ` — "${args.query}"`;
        if (aliasResolved) text += ` → "${resolvedQuery}" (도메인 약칭 변환)`;
      }
      text += "\n";
      text += `전체 ${total}건`;
      if (args.query) text += ` 중 ${filtered.length}건 매칭`;
      text += ` · ${sliced.length}건 표시`;
      if (cacheUsed) text += ` (캐시 사용)`;
      text += "\n\n";

      for (let i = 0; i < sliced.length; i++) {
        const it = sliced[i];
        if (!it) continue;
        const abbr = it.법령약칭명 || "(약칭 미등록)";
        text += `[${i + 1}] ${it.법령명한글}\n`;
        text += `    약칭: ${abbr}\n`;
        const meta: string[] = [];
        if (it.법령구분명) meta.push(it.법령구분명);
        if (it.현행연혁코드) meta.push(it.현행연혁코드);
        if (it.소관부처명) meta.push(it.소관부처명);
        if (it.시행일자) meta.push(`시행 ${it.시행일자}`);
        if (meta.length > 0) text += `    ${meta.join(" · ")}\n`;
        text += `    [mst=${it.법령일련번호}, lawId=${it.법령ID}]\n\n`;
      }

      const firstItem = sliced[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_law_text",
            args: { mst: firstItem.법령일련번호 },
            reason: `${firstItem.법령명한글} 본문`,
          },
          {
            tool: "search_law",
            args: { query: firstItem.법령명한글 },
            reason: "정식 검색 (약칭이 다른 법령과 충돌 시)",
          },
        ]);
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_law_abbreviations");
    }
  },
};

/** 테스트용: 모듈 캐시 강제 초기화 */
export function __resetAbbrevCache(): void {
  CACHE = null;
}
