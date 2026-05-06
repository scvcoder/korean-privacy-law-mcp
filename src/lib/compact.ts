/**
 * 긴 본문 계단식 축약 — PIPC 의결문(평균 1만자+) 토큰 절약용.
 * 앞 800자 + 중략 마커 + 뒤 400자. minSave 가드로 짧은 본문은 그대로 유지.
 */

const HEAD_LIMIT = 800;
const TAIL_LIMIT = 400;
const MIN_LENGTH_TO_COMPACT = 1300;

/** 한국어 종결어미 — 문장 경계 탐지 */
const SENTENCE_ENDINGS = /(?:다\.|라\.|요\.|음\.|함\.|이다\.|것이다\.|판단된다\.)\s*/g;

export interface CompactOptions {
  /** override head 글자수 */
  headLimit?: number;
  /** override tail 글자수 */
  tailLimit?: number;
  /** override 최소 압축 길이 임계값 */
  minLength?: number;
}

export function compactBody(text: string, options: CompactOptions = {}): string {
  const head = options.headLimit ?? HEAD_LIMIT;
  const tail = options.tailLimit ?? TAIL_LIMIT;
  const minLen = options.minLength ?? MIN_LENGTH_TO_COMPACT;

  if (text.length <= minLen) return text;
  if (text.length <= head + tail) return text;

  const headRaw = text.substring(0, head);
  const tailRaw = text.substring(text.length - tail);

  const headFinal = trimAtSentenceEnd(headRaw);
  const tailFinal = trimAtSentenceStart(tailRaw);

  const omitted = text.length - headFinal.length - tailFinal.length;
  if (omitted <= 0) return text;

  return `${headFinal}\n\n⋯ 중략 ${omitted}자 (full=true로 전문 조회) ⋯\n\n${tailFinal}`;
}

function trimAtSentenceEnd(text: string): string {
  const matches = [...text.matchAll(SENTENCE_ENDINGS)];
  if (matches.length === 0) return text;
  const last = matches[matches.length - 1];
  if (!last || last.index === undefined) return text;
  return text.substring(0, last.index + last[0].length).trimEnd();
}

function trimAtSentenceStart(text: string): string {
  // 첫 종결 다음 시작점 — 문장 중간 잘림 방지
  const m = text.match(/[.。]\s+([가-힣A-Z\d])/);
  if (!m || m.index === undefined) return text;
  return text.substring(m.index + m[0].length - 1);
}
