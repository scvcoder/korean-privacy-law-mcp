/**
 * Layer C — PIPC 코퍼스 BM25 인덱스 (lazy singleton).
 *
 * 부팅 시 즉시 로드하지 않고 첫 검색 호출에서 build → 이후 메모리 재사용.
 * 약 2,202 청크 (1,745 상담사례 + 457 가이드 청크).
 *
 * Contextual Retrieval 적용: body + chunk_context 둘 다 색인 → 검색 정확도 ↑.
 *
 * 데이터 위치: data/hf_dataset/*.jsonl (script 위치 기준 ../data 경로 fallback).
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import MiniSearch from "minisearch";

/** 모든 청크 공통 필드 (guide·case 합집합) */
export interface CorpusChunk {
  /** 인덱스 PK */
  chunk_id: string;
  source_type: "guide" | "case";
  doc_id: string;
  doc_title: string;
  doc_date: string;
  section: string;
  body: string;
  chunk_context: string;
  source_pdf?: string;
  source_url?: string;
  chunk_no?: number;
  pages?: string;
  /** case 전용 — 카테고리 트리 (처리자 × 처리행위 × 분야) */
  category1?: string;
  category2?: string;
  category3?: string;
  /** case 전용 — privacy.go.kr 식별자 */
  ntt_id?: string;
  ntt_no?: string;
  title?: string;
  summary?: string;
  case_year?: string;
  reg_dt?: string;
  type_code?: string;
  type_label?: string;
  source_note?: string;
  detail_url?: string;
}

const CORPUS_FILES = [
  "개인정보_질의응답_모음집(2025.12.).jsonl",
  "소상공인을_위한_개인정보 보호_핸드북(2024.12).jsonl",
  "고정형 영상정보처리기기_설치_운영_안내서(2024.12).jsonl",
  "분야별_개인정보_보호_안내서(2024.12).jsonl",
  "개인정보포털_상담사례.jsonl",
];

/** doc_id → doc_type alias 매핑 (search_privacy_guides의 사용자-친화 필터) */
export const DOC_TYPE_ALIAS: Record<string, string> = {
  qa: "질의응답_모음집",
  small_business: "소상공인을_위한_개인정보_보호_핸드북",
  cctv: "고정형_영상정보처리기기_설치_운영_안내서",
  sectoral: "분야별_개인정보_보호_안내서",
};

interface CorpusIndex {
  search: MiniSearch<CorpusChunk>;
  byId: Map<string, CorpusChunk>;
  totalChunks: number;
  byType: { guide: number; case: number };
  byDoc: Map<string, number>;
  loadedAt: number;
}

let CACHE: CorpusIndex | null = null;

/** 데이터 디렉터리 위치 결정 — cwd 기준 우선, 없으면 script-relative fallback */
function resolveDataDir(): string {
  const cwdPath = resolve(process.cwd(), "data/hf_dataset");
  if (existsSync(cwdPath)) return cwdPath;

  // dist/lib/corpus-index.js 또는 src/lib/corpus-index.ts 기준 ../../data/hf_dataset
  const here = dirname(fileURLToPath(import.meta.url));
  const scriptRel = resolve(here, "..", "..", "data", "hf_dataset");
  if (existsSync(scriptRel)) return scriptRel;

  // 한 단계 더 위 (dist/index.js 같이 평탄 빌드 시)
  const oneUp = resolve(here, "..", "data", "hf_dataset");
  if (existsSync(oneUp)) return oneUp;

  throw new Error(
    `Layer C 코퍼스 데이터 디렉터리를 찾을 수 없음 (cwd=${process.cwd()}). ` +
      `data/hf_dataset/*.jsonl 위치 확인 필요.`
  );
}

function loadJsonl(filePath: string): CorpusChunk[] {
  if (!existsSync(filePath)) return [];
  const text = readFileSync(filePath, "utf8");
  const out: CorpusChunk[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as CorpusChunk);
    } catch {
      // 손상된 줄은 스킵 (전체 인덱스 빌드 실패 회피)
    }
  }
  return out;
}

function buildIndex(): CorpusIndex {
  const dataDir = resolveDataDir();
  const chunks: CorpusChunk[] = [];
  for (const f of CORPUS_FILES) {
    chunks.push(...loadJsonl(join(dataDir, f)));
  }

  const byId = new Map<string, CorpusChunk>();
  const byDoc = new Map<string, number>();
  let guideCount = 0;
  let caseCount = 0;

  for (const c of chunks) {
    byId.set(c.chunk_id, c);
    byDoc.set(c.doc_id, (byDoc.get(c.doc_id) ?? 0) + 1);
    if (c.source_type === "guide") guideCount++;
    else if (c.source_type === "case") caseCount++;
  }

  const search = new MiniSearch<CorpusChunk>({
    idField: "chunk_id",
    fields: ["body", "chunk_context", "section", "doc_title", "title"],
    storeFields: [
      "chunk_id",
      "source_type",
      "doc_id",
      "doc_title",
      "doc_date",
      "section",
      "body",
      "chunk_context",
      "source_pdf",
      "source_url",
      "pages",
      "category1",
      "category2",
      "category3",
      "ntt_id",
      "title",
      "summary",
      "case_year",
      "reg_dt",
      "detail_url",
    ],
    searchOptions: {
      // BM25 기본; 쿼리 토큰 prefix 매칭 + fuzzy(0.2) — 한국어 종결어미 변형 흡수
      prefix: true,
      fuzzy: 0.2,
      boost: { chunk_context: 2, body: 1, title: 3 },
    },
    // 한국어 토크나이저 — 단순 공백·구두점 분리 (minisearch 기본 정규식이 한글에 충분)
    tokenize: (text: string) =>
      text
        .toLowerCase()
        .split(/[\s\p{P}]+/u)
        .filter((t) => t.length > 0),
  });

  search.addAll(chunks);

  return {
    search,
    byId,
    totalChunks: chunks.length,
    byType: { guide: guideCount, case: caseCount },
    byDoc,
    loadedAt: Date.now(),
  };
}

/** Lazy singleton — 첫 호출 시 빌드, 이후 재사용. */
export function getCorpusIndex(): CorpusIndex {
  if (CACHE) return CACHE;
  CACHE = buildIndex();
  return CACHE;
}

/** 테스트용 — 캐시 강제 초기화. */
export function __resetCorpusIndex(): void {
  CACHE = null;
}

export interface CorpusSearchOptions {
  /** source_type 필터 (guide·case·둘 다 = undefined) */
  sourceType?: "guide" | "case";
  /** doc_id 필터 (정확 매칭) */
  docId?: string;
  /** category1/2/3 부분 매칭 (case 전용) */
  category1?: string;
  category2?: string;
  category3?: string;
  /** case 연도 범위 (YYYY) */
  yearMin?: string;
  yearMax?: string;
  /** 결과 개수 (기본 5, 최대 30) */
  display?: number;
}

export interface CorpusSearchResult {
  chunk: CorpusChunk;
  score: number;
}

/**
 * BM25 검색 + post-filter (메타 필드).
 * minisearch는 메타 필드 색인에 약하므로 후처리 필터링이 더 안정적.
 */
export function searchCorpus(
  query: string,
  opts: CorpusSearchOptions = {}
): CorpusSearchResult[] {
  const idx = getCorpusIndex();
  const display = Math.min(Math.max(opts.display ?? 5, 1), 30);

  const raw = idx.search.search(query, { combineWith: "AND" });
  // raw가 적으면 OR로 fallback
  const results = raw.length >= display
    ? raw
    : idx.search.search(query, { combineWith: "OR" });

  const filtered: CorpusSearchResult[] = [];
  for (const r of results) {
    const chunk = idx.byId.get(String(r.id));
    if (!chunk) continue;
    if (opts.sourceType && chunk.source_type !== opts.sourceType) continue;
    if (opts.docId && chunk.doc_id !== opts.docId) continue;
    if (opts.category1 && !(chunk.category1 ?? "").includes(opts.category1))
      continue;
    if (opts.category2 && !(chunk.category2 ?? "").includes(opts.category2))
      continue;
    if (opts.category3 && !(chunk.category3 ?? "").includes(opts.category3))
      continue;
    if (opts.yearMin && (chunk.case_year ?? "") < opts.yearMin) continue;
    if (opts.yearMax && (chunk.case_year ?? "") > opts.yearMax) continue;
    filtered.push({ chunk, score: r.score });
    if (filtered.length >= display) break;
  }

  return filtered;
}
