/**
 * Layer B+ — 분야별 관련법령 데이터 로더 (lazy singleton).
 *
 * 출처:
 *  1. PIPC 분야별 개인정보 보호 안내서(2024.12) — 8개 분야 정형 표
 *  2. 개인정보 포털 (privacy.go.kr) — 일반 도메인 12 법령 + 23 행정규칙
 *
 * 데이터 위치: data/related_laws.jsonl (1 portal_corpus + 8 sector entries)
 *
 * 메타 철학: 우리 큐레이션 0 — PIPC 공식 출처 그대로 인덱스화. 응답에 페이지·출처
 * 자동 첨부로 LLM이 검증 가능. official_laws (공식 표) vs additional_mentions
 * (본문 산재 빈도) 분리로 신뢰도 차이 명시.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

export interface PortalLaw {
  name: string;
  ministry: string;
}

export interface PortalAdmrule {
  name: string;
  law_kind: string;
}

export interface PortalCorpus {
  type: "portal_corpus";
  title: string;
  note: string;
  source_url_laws: string;
  source_url_admrules: string;
  laws: PortalLaw[];
  admrules: PortalAdmrule[];
}

export interface OfficialLaw {
  name: string;
  short?: string;
  summary: string;
  sources: Array<{ label: string; page: string }>;
  ministry?: string;
  domain?: string; // 공공기관 편 — 감사·공직선거·수사·행정조사
  kind?: string; // enforcement_decree·enforcement_rule·notification·rule·regulation
}

export interface AdditionalMention {
  name: string;
  mention_count: number;
  context_excerpt: string;
  note: string;
  kind?: string;
}

export interface SectorEntry {
  type: "sector";
  scope: string;
  guide: {
    title: string;
    date: string;
    ministry: string;
    page_range: string;
    publisher: string;
    license: string;
  };
  lex_specialis: string;
  official_laws: OfficialLaw[];
  additional_mentions: AdditionalMention[];
}

interface DataIndex {
  portal: PortalCorpus;
  sectors: SectorEntry[];
  bySectorName: Map<string, SectorEntry>;
  loadedAt: number;
}

let CACHE: DataIndex | null = null;

const DATA_FILE = "related_laws.jsonl";

/** data/ 위치 결정 — cwd 기준 우선, script-relative fallback */
function resolveDataFile(): string {
  const cwdPath = resolve(process.cwd(), "data", DATA_FILE);
  if (existsSync(cwdPath)) return cwdPath;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of [
    join(here, "..", "..", "data", DATA_FILE),
    join(here, "..", "data", DATA_FILE),
  ]) {
    if (existsSync(rel)) return rel;
  }
  throw new Error(
    `data/${DATA_FILE} 위치 찾을 수 없음 (cwd=${process.cwd()})`
  );
}

/** Sector 별칭 — 사용자 입력 정규화 */
const SECTOR_ALIASES: Record<string, string> = {
  // 인사·노무
  "인사": "인사·노무",
  "노무": "인사·노무",
  "인사노무": "인사·노무",
  "근로": "인사·노무",
  "채용": "인사·노무",
  "고용": "인사·노무",
  "직원": "인사·노무",
  // 사회복지시설
  "사회복지": "사회복지시설",
  "복지시설": "사회복지시설",
  "사회복지 시설": "사회복지시설",
  // 의료기관
  "의료": "의료기관",
  "병원": "의료기관",
  // 약국
  "약사": "약국",
  // 학원·교습소
  "학원": "학원·교습소",
  "교습소": "학원·교습소",
  "학원교습소": "학원·교습소",
  // 통계작성
  "통계": "통계작성",
  // 공공기관
  "공공": "공공기관",
  "감사": "공공기관",
  "공직선거": "공공기관",
  "선거": "공공기관",
  "수사": "공공기관",
  "행정조사": "공공기관",
  // 온라인 경품
  "온라인 경품": "온라인경품",
  "경품": "온라인경품",
  "경품행사": "온라인경품",
};

export function resolveSectorName(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 정확 매칭
  const idx = getDataIndex();
  if (idx.bySectorName.has(trimmed)) return trimmed;
  // 별칭
  const alias = SECTOR_ALIASES[trimmed];
  if (alias && idx.bySectorName.has(alias)) return alias;
  // 부분 포함 매칭 (마지막 수단)
  for (const name of idx.bySectorName.keys()) {
    if (name.includes(trimmed) || trimmed.includes(name)) return name;
  }
  return null;
}

export function getAvailableSectors(): string[] {
  return [...getDataIndex().bySectorName.keys()];
}

function buildIndex(): DataIndex {
  const filePath = resolveDataFile();
  const text = readFileSync(filePath, "utf8");

  let portal: PortalCorpus | null = null;
  const sectors: SectorEntry[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const obj = JSON.parse(trimmed) as PortalCorpus | SectorEntry;
    if (obj.type === "portal_corpus") portal = obj;
    else if (obj.type === "sector") sectors.push(obj);
  }

  if (!portal) throw new Error("portal_corpus entry 없음");
  if (sectors.length !== 8)
    throw new Error(`sector entries 8개여야 함 — 현재 ${sectors.length}개`);

  const bySectorName = new Map<string, SectorEntry>();
  for (const s of sectors) bySectorName.set(s.scope, s);

  return { portal, sectors, bySectorName, loadedAt: Date.now() };
}

export function getDataIndex(): DataIndex {
  if (CACHE) return CACHE;
  CACHE = buildIndex();
  return CACHE;
}

/** 테스트용 강제 초기화 */
export function __resetSectoralCache(): void {
  CACHE = null;
}
