/**
 * 개인정보 도메인 약칭 사전.
 * search_law fallback에서 약칭을 정식 명칭으로 자동 변환 (별도 도구 X).
 */

export interface AliasEntry {
  canonical: string;
  aliases: string[];
}

export const PRIVACY_ALIASES: AliasEntry[] = [
  // 핵심 — PIPA
  { canonical: "개인정보 보호법", aliases: ["개보법", "개인정보법", "개인정보보호법", "PIPA"] },
  { canonical: "개인정보 보호법 시행령", aliases: ["개보법 시행령", "개인정보보호법 시행령", "PIPA 시행령"] },
  { canonical: "개인정보 보호법 시행규칙", aliases: ["개보법 시행규칙", "개인정보보호법 시행규칙"] },

  // 흡수된 영역 (Tier 4)
  {
    canonical: "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
    aliases: ["정보통신망법", "정통망법", "정통법"],
  },

  // 인접 보호 영역 (Tier 2)
  { canonical: "신용정보의 이용 및 보호에 관한 법률", aliases: ["신용정보법", "신정법"] },
  { canonical: "위치정보의 보호 및 이용 등에 관한 법률", aliases: ["위치정보법", "위정법"] },
  { canonical: "통신비밀보호법", aliases: ["통비법"] },
  { canonical: "의료법", aliases: [] },
  { canonical: "전기통신사업법", aliases: ["전사법"] },

  // PIPC 공식 결합법령 (Tier 1)
  { canonical: "공공기관의 정보공개에 관한 법률", aliases: ["정보공개법"] },
  { canonical: "전자정부법", aliases: [] },
  { canonical: "전자서명법", aliases: [] },
  { canonical: "주민등록법", aliases: [] },
  { canonical: "공공기관의 운영에 관한 법률", aliases: ["공공기관운영법", "공운법"] },
  { canonical: "지방공기업법", aliases: [] },
  { canonical: "국가인권위원회법", aliases: ["인권위법"] },
  { canonical: "초·중등교육법", aliases: ["초중등교육법"] },
  { canonical: "고등교육법", aliases: [] },
];

const ALIAS_MAP = (() => {
  const m = new Map<string, string>();
  for (const entry of PRIVACY_ALIASES) {
    m.set(entry.canonical, entry.canonical);
    for (const alias of entry.aliases) m.set(alias, entry.canonical);
  }
  return m;
})();

/** 약칭/별칭이면 정식 명칭으로 변환. 매칭 없으면 입력 그대로 반환. */
export function resolveLawAlias(input: string): string {
  return ALIAS_MAP.get(input.trim()) ?? input;
}

/** 모든 알려진 법령명·약칭 (citations.extractCitations의 lookback에서 사용) */
export function getAllKnownLawNames(): string[] {
  const names = new Set<string>();
  for (const entry of PRIVACY_ALIASES) {
    names.add(entry.canonical);
    for (const a of entry.aliases) names.add(a);
  }
  return Array.from(names);
}
