import { z } from "zod";
import type { Tool } from "../types.js";
import { extractTag, extractTagAll, parseSearchXML } from "../../client/xml-parse.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("법령용어 키워드 (예: '개인정보', '가명정보', '고유식별정보')"),
  display: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("결과 개수 (기본 5, 최대 20). 본문 정의 자동 첨부."),
  page: z.number().int().min(1).default(1).describe("페이지 번호 (기본 1)"),
  withDefinitions: z
    .boolean()
    .default(true)
    .describe(
      "각 용어의 정의 본문 자동 fetch (lawService 1회 추가 호출). " +
        "false면 검색 결과만 — trmSeqs 노출, 정의 미포함."
    ),
});

interface TermSearchItem {
  법령용어ID: string;
  법령용어명: string;
  사전구분코드: string;
  법령종류코드: string;
}

interface TermDefinition {
  trmSeq: string;
  용어명: string;
  출처: string;
  정의: string;
}

/**
 * lstrm 본문 응답은 평탄(flat) XML — 같은 태그가 trmSeq 수만큼 반복됨.
 * extractTagAll로 각 필드 배열을 뽑아 인덱스로 zip 매칭.
 *
 *   <LsTrmService>
 *     <법령용어일련번호>A</법령용어일련번호>
 *     <법령용어명_한글>...A</법령용어명_한글>
 *     <출처>...A</출처>
 *     <법령용어정의>...A</법령용어정의>
 *     <법령용어일련번호>B</법령용어일련번호>
 *     ...
 *   </LsTrmService>
 */
function parseDefinitions(xml: string): TermDefinition[] {
  const seqs = extractTagAll(xml, "법령용어일련번호");
  const names = extractTagAll(xml, "법령용어명_한글");
  const sources = extractTagAll(xml, "출처");
  const defs = extractTagAll(xml, "법령용어정의");

  const len = Math.min(seqs.length, names.length, sources.length, defs.length);
  const out: TermDefinition[] = [];
  for (let i = 0; i < len; i++) {
    const seq = seqs[i];
    const name = names[i];
    const source = sources[i];
    const def = defs[i];
    if (!seq || !name) continue;
    out.push({
      trmSeq: seq,
      용어명: name,
      출처: source ?? "",
      정의: (def ?? "").trim(),
    });
  }
  return out;
}

export const getLegalTerm: Tool<typeof inputSchema> = {
  name: "get_legal_term",
  description:
    "법령용어 검색 + 정의 통합 (법제처 lawSearch · target=lstrm 검색 → lawService · target=lstrm 본문). " +
    "키워드 매칭 용어 목록과 각 정의 본문(법령정의사전)을 한 번에 노출. " +
    "동일 용어가 여러 법령에서 정의되는 경우 각 정의·출처 모두 펼침. " +
    "예: '개인정보' → 「개인정보 보호법」§2·시행령·각 부처 훈령 정의 비교. " +
    "withDefinitions=false면 목록만. 다음: get_term_articles(용어ID)로 해당 용어 사용 조문 추적.",
  inputSchema,

  async handler(args, client) {
    try {
      // 1단계: 검색
      const searchXml = await client.fetchApi({
        endpoint: "lawSearch.do",
        target: "lstrm",
        extraParams: {
          query: args.query,
          display: String(args.display),
          page: String(args.page),
        },
      });

      const search = parseSearchXML<TermSearchItem>(
        searchXml,
        "LsTrmSearch",
        "lstrm",
        (itemXml) => ({
          법령용어ID: extractTag(itemXml, "법령용어ID"),
          법령용어명: extractTag(itemXml, "법령용어명"),
          사전구분코드: extractTag(itemXml, "사전구분코드"),
          법령종류코드: extractTag(itemXml, "법령종류코드"),
        })
      );

      if (search.totalCnt === 0 || search.items.length === 0) {
        return notFoundResponse(`법령용어 검색 결과 없음: "${args.query}"`, [
          `intelligent_law_search(query="${args.query}") — 조문 의미검색`,
          `search_law(query="${args.query}") — 법령명·내용 검색`,
        ]);
      }

      // 2단계: 본문(정의) 통합 fetch (옵션)
      let definitions: TermDefinition[] = [];
      if (args.withDefinitions) {
        // 각 항목의 법령용어ID(콤마 구분 다중값 가능)를 모두 모아 한 번에 호출
        const allTrmSeqs = search.items
          .flatMap((it) => it.법령용어ID.split(",").map((s) => s.trim()))
          .filter((s) => s.length > 0);
        const uniqueTrmSeqs = [...new Set(allTrmSeqs)];

        if (uniqueTrmSeqs.length > 0) {
          try {
            const detailXml = await client.fetchApi({
              endpoint: "lawService.do",
              target: "lstrm",
              extraParams: { trmSeqs: uniqueTrmSeqs.join(",") },
            });
            definitions = parseDefinitions(detailXml);
          } catch {
            // 본문 fetch 실패 시 검색 결과만 출력
            definitions = [];
          }
        }
      }

      const defByTrmSeq = new Map<string, TermDefinition>();
      for (const d of definitions) defByTrmSeq.set(d.trmSeq, d);

      // 응답 조립
      let text = `법령용어 — "${args.query}"\n`;
      text += `총 ${search.totalCnt}건 중 ${search.items.length}건 표시 (페이지 ${search.page})\n\n`;

      for (let i = 0; i < search.items.length; i++) {
        const item = search.items[i];
        if (!item) continue;
        text += `[${i + 1}] ${item.법령용어명}\n`;
        text += `  trmSeqs: ${item.법령용어ID}\n`;

        const trmSeqList = item.법령용어ID.split(",").map((s) => s.trim()).filter(Boolean);
        const matchedDefs = trmSeqList
          .map((seq) => defByTrmSeq.get(seq))
          .filter((d): d is TermDefinition => d !== undefined);

        if (args.withDefinitions && matchedDefs.length > 0) {
          for (const d of matchedDefs) {
            const sourceLine = d.출처
              ? `  📖 ${d.출처}`
              : `  📖 (출처 없음)`;
            text += `${sourceLine}\n`;
            text += `     ${d.정의 || "(정의 비어 있음)"}\n`;
          }
        } else if (args.withDefinitions) {
          text += `  (정의 본문 fetch 실패 또는 비어 있음)\n`;
        }
        text += "\n";
      }

      const firstItem = search.items[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_term_articles",
            args: { trmSeqs: firstItem.법령용어ID },
            reason: `"${firstItem.법령용어명.slice(0, 30)}" 사용 조문 추적`,
          },
          {
            tool: "search_law",
            args: { query: args.query },
            reason: `"${args.query}" 사용된 법령 본문 검색`,
          },
        ]);
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_legal_term");
    }
  },
};
