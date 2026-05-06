/**
 * 법제처 API XML 응답 파서.
 * 단순 태그 추출은 regex(빠르고 가벼움), 구조화 파싱은 fast-xml-parser 사용.
 */

import { XMLParser } from "fast-xml-parser";

/**
 * `<![CDATA[...]]>` wrapper 자동 제거.
 * 법제처 XML이 한글·특수문자 필드를 CDATA로 감싸서 보내기 때문에 필수.
 */
function unwrapCdata(s: string): string {
  const m = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return m && m[1] !== undefined ? m[1] : s;
}

/**
 * 태그 1개 추출 — 첫 매칭만 반환.
 * **case-sensitive** — 법제처 XML 응답에 `<Ppc>`(rootTag)와 `<ppc>`(itemTag)가
 * 케이스만 다른 채 공존하는 경우가 있어 case-insensitive 매칭 시 outer 태그가
 * inner의 닫는 태그(`</ppc>`)에 잘림.
 *
 * CDATA wrapper 자동 제거 — 한글 필드(법령명·안건명 등)는 거의 모두 CDATA로 감싸짐.
 */
export function extractTag(xml: string, tagName: string): string {
  // 안전한 태그명 (영문·한글·숫자만 허용)
  if (!/^[가-힣A-Za-z0-9_]+$/.test(tagName)) {
    return "";
  }
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`);
  const m = xml.match(re);
  if (!m || !m[1]) return "";
  return unwrapCdata(m[1].trim());
}

/** 태그 N개 추출 — 모든 매칭 반환. case-sensitive + CDATA unwrap (`extractTag`와 동일). */
export function extractTagAll(xml: string, tagName: string): string[] {
  if (!/^[가-힣A-Za-z0-9_]+$/.test(tagName)) {
    return [];
  }
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) out.push(unwrapCdata(m[1].trim()));
  }
  return out;
}

export interface SearchXmlResult<T> {
  totalCnt: number;
  page: number;
  items: T[];
}

export interface ParseSearchOptions {
  /** 총건수 태그명 (기본 "totalCnt"). aiSearch는 "검색결과개수" 사용. */
  totalCntTag?: string;
  /** 페이지 태그명 (기본 "page") */
  pageTag?: string;
}

/**
 * 법제처 검색 응답 파싱.
 * <{rootTag}><totalCnt>N</totalCnt><page>N</page><{itemTag}>...</{itemTag}>...</{rootTag}>
 *
 * mapper는 각 itemTag 내부 XML을 받아 도메인 객체로 변환.
 * 일부 endpoint는 totalCnt 태그명이 다름 (예: aiSearch=검색결과개수) — options로 override.
 */
export function parseSearchXML<T>(
  xml: string,
  rootTag: string,
  itemTag: string,
  mapper: (itemXml: string) => T,
  options: ParseSearchOptions = {}
): SearchXmlResult<T> {
  const totalCntTag = options.totalCntTag ?? "totalCnt";
  const pageTag = options.pageTag ?? "page";

  const totalCnt = parseInt(extractTag(xml, totalCntTag), 10) || 0;
  const page = parseInt(extractTag(xml, pageTag), 10) || 1;

  // rootTag 내부에서만 itemTag 검색 (선택적 — 부정확한 필터링 회피)
  const rootContent = extractTag(xml, rootTag) || xml;
  const itemContents = extractTagAll(rootContent, itemTag);

  const items = itemContents.map(mapper);
  return { totalCnt, page, items };
}

const DEFAULT_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

/**
 * 전체 XML → 중첩 객체. 복잡한 구조(법령 본문 등) 파싱용.
 * 단일 vs 배열 정규화는 호출자 책임.
 */
export function parseXML(xml: string): unknown {
  return DEFAULT_PARSER.parse(xml);
}

/** 단일 객체 또는 배열을 항상 배열로 정규화 (fast-xml-parser quirk 처리) */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * 본문 안의 HTML 태그 제거 + 엔티티 디코딩.
 * 영문법령(elaw) 응답에 검색 강조 `<strong>` 태그가 들어오는 quirk 등 처리.
 */
export function stripHtmlTags(s: string): string {
  if (!s) return s;
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
