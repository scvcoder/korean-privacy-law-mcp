/**
 * 한국 법률 인용 파서.
 * - 원숫자(①②③…) 항번호 파싱 (법제처 API quirk)
 * - 조·항·호·목 파싱 ("제15조제1항제2호가목")
 * - 30자 lookback 인용 추출 (verify_pipa_citation에서 사용)
 */

const CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/**
 * 원숫자 또는 ASCII 숫자에서 정수 추출.
 * 법제처 API가 항번호를 "① "로 리턴하는데 parseInt로는 NaN.
 */
export function parseCircledNumber(text: string): number | null {
  const trimmed = text.trim();
  // Circled first
  for (const ch of trimmed) {
    const idx = CIRCLED_NUMBERS.indexOf(ch);
    if (idx >= 0) return idx + 1;
  }
  // ASCII digits
  const digits = trimmed.match(/\d+/);
  if (digits) {
    const n = parseInt(digits[0], 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 조·항·호·목 구조화 표현 */
export interface JoCode {
  /** 조 (제15조의 15) */
  jo: number;
  /** 조의N — 추가 분기 (제24조의2의 2) */
  jo_branch?: number;
  /** 항 (제○항) */
  hang?: number;
  /** 호 (제○호) */
  ho?: number;
  /** 목 (가/나/다…) */
  mok?: string;
}

/** "제15조제1항제2호가목" 같은 문자열을 JoCode로 파싱. 실패 시 null. */
export function parseJoCode(citation: string): JoCode | null {
  const cleaned = citation.replace(/\s+/g, "");
  const re = /제(\d+)조(?:의(\d+))?(?:제(\d+)항)?(?:제(\d+)호)?(?:([가-힣])목)?/;
  const m = cleaned.match(re);
  if (!m || !m[1]) return null;
  const result: JoCode = { jo: parseInt(m[1], 10) };
  if (m[2]) result.jo_branch = parseInt(m[2], 10);
  if (m[3]) result.hang = parseInt(m[3], 10);
  if (m[4]) result.ho = parseInt(m[4], 10);
  if (m[5]) result.mok = m[5];
  return result;
}

/** JoCode를 정규형 문자열로 (역포맷) */
export function formatJoCode(code: JoCode): string {
  let s = `제${code.jo}조`;
  if (code.jo_branch !== undefined) s += `의${code.jo_branch}`;
  if (code.hang !== undefined) s += `제${code.hang}항`;
  if (code.ho !== undefined) s += `제${code.ho}호`;
  if (code.mok !== undefined) s += `${code.mok}목`;
  return s;
}

/**
 * 인용 문자열 정규화 — `§·①·호` 같은 약식 표기를 한국 법령 정식 표기로.
 *
 * 입력: "PIPA §15 ① 6호" / "개인정보 보호법 제15조제1항제6호" / 「○○법」 §22 등
 * 출력: "개인정보 보호법 제15조제1항제6호"
 *
 * verify_pipa_citation의 입력 파싱에 사용.
 */
export function normalizeCitationText(input: string): string {
  let s = input;
  // 「」, ｢｣ 괄호 제거
  s = s.replace(/[「」｢｣]/g, "");
  // 원숫자 항번호 → 제N항
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  for (let i = 0; i < circled.length; i++) {
    s = s.split(circled[i]!).join(`제${i + 1}항`);
  }
  // §15 → 제15조 (의2 분기 포함: §15의2 → 제15조의2)
  s = s.replace(/§\s*(\d+)(?:의\s*(\d+))?/g, (_m, n, br) =>
    br ? `제${n}조의${br}` : `제${n}조`
  );
  // "1호", "6호" → 제1호 (이미 제N호이면 두 번 변환 안 되도록 lookbehind)
  s = s.replace(/(?<!제)(\d+)호/g, "제$1호");
  // 공백 정리
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * 인용 문자열 분해 — 법령명 + 조항호목.
 *
 * 입력: "PIPA §15 ① 6호" → { lawName: "PIPA", joCode: { jo:15, hang:1, ho:6 } }
 * lawName 정규화는 호출자가 resolveLawAlias로 별도 적용.
 */
export interface ParsedCitation {
  lawName: string;
  joCode: JoCode;
  /** 정규화된 인용 (디버깅용) */
  normalized: string;
}

export function parseCitation(input: string): ParsedCitation | null {
  const normalized = normalizeCitationText(input);
  // 법령명 + 조문 분리: 첫 "제N조"부터 조문 부분 (조항호목 사이 공백 허용)
  const m = normalized.match(
    /^(.+?)\s*(제\d+조(?:의\d+)?(?:\s*제\d+항)?(?:\s*제\d+호)?(?:\s*[가-힣]목)?)$/
  );
  if (!m || !m[1] || !m[2]) return null;
  const lawName = m[1].trim();
  // parseJoCode는 자체적으로 공백 제거 (cleaned)
  const joCode = parseJoCode(m[2]);
  if (!joCode || !lawName) return null;
  return { lawName, joCode, normalized };
}

/**
 * 조문 식별자를 법제처 API JO 6자리(조4 + 가지2)로 정규화.
 * 허용 입력:
 *  - 6자리 ("001500", "002802") → 그대로
 *  - 1~4자리 숫자 ("15", "0015") → "001500"
 *  - "제15조", "제28조의2" 등 한글 표현 → parseJoCode 경유 변환
 * 실패 시 null.
 */
export function toJoParam(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{6}$/.test(trimmed)) return trimmed;
  if (/^\d{1,4}$/.test(trimmed)) return trimmed.padStart(4, "0") + "00";
  const parsed = parseJoCode(trimmed);
  if (!parsed) return null;
  const jo = String(parsed.jo).padStart(4, "0");
  const branch = String(parsed.jo_branch ?? 0).padStart(2, "0");
  return jo + branch;
}

export interface ExtractedCitation {
  lawName: string;
  article: string;
  joCode?: JoCode;
  startIndex: number;
  endIndex: number;
}

const LOOKBACK_CHARS = 30;

/**
 * 텍스트에서 "법령명 + 조문" 인용 패턴 추출.
 * 각 조문 직전 30자 안에서 법령명을 역추적 (lookback regex).
 */
export function extractCitations(text: string, knownLawNames: string[] = []): ExtractedCitation[] {
  const results: ExtractedCitation[] = [];
  // "제○조" 또는 "제○조의○" + 후속 항/호/목 (선택)
  const articleRegex = /제\d+조(?:의\d+)?(?:\s*제\d+항)?(?:\s*제\d+호)?(?:\s*[가-힣]목)?/g;

  const uniqueNames = [...new Set(knownLawNames)];

  let match: RegExpExecArray | null;
  while ((match = articleRegex.exec(text)) !== null) {
    const articleStart = match.index;
    const articleEnd = articleStart + match[0].length;

    const lookback = text.substring(Math.max(0, articleStart - LOOKBACK_CHARS), articleStart);
    const lawName = findLawNameInLookback(lookback, uniqueNames);
    if (!lawName) continue;

    const joCode = parseJoCode(match[0]) ?? undefined;
    results.push({
      lawName,
      article: match[0].replace(/\s+/g, ""),
      joCode,
      startIndex: articleStart,
      endIndex: articleEnd,
    });
  }
  return results;
}

function findLawNameInLookback(lookback: string, knownLawNames: string[]): string | null {
  // 인용 직전(lookback 우측) 끝점이 가장 가까운 법령명을 우선.
  // 동률(겹침)일 경우 더 긴 이름을 우선 — "개인정보 보호법 시행령" vs "개인정보 보호법" 같은 substring 충돌 회피.
  let best: { name: string; endIndex: number; length: number } | null = null;
  for (const name of knownLawNames) {
    const idx = lookback.lastIndexOf(name);
    if (idx < 0) continue;
    const endIndex = idx + name.length;
    if (
      !best ||
      endIndex > best.endIndex ||
      (endIndex === best.endIndex && name.length > best.length)
    ) {
      best = { name, endIndex, length: name.length };
    }
  }
  if (best) return best.name;

  // 일반 패턴 fallback: "○○법", "○○령", "○○규칙", "○○고시" 등
  const generic = lookback.match(
    /([가-힣A-Za-z·\s]+(?:법(?:률)?|령|규칙|고시|예규|훈령|지침))(?:[\s,(]|$)/
  );
  if (generic && generic[1]) return generic[1].trim();
  return null;
}
