/**
 * 정규 URL 생성기. 모든 도구 응답에 첨부되어 LLM 인용 검증을 가능케 한다.
 * Layer C 응답에는 PIPC attribution 포맷을 추가로 사용 (pipc-attribution 라이선스 준수).
 */

const LAW_GO_KR = "https://www.law.go.kr";
const PRIVACY_GO_KR = "https://www.privacy.go.kr";

/** 법령 ID (lawId, 시점 무관 식별자) → 본문 페이지. */
export function lawDetailUrl(lawId: string): string {
  return `${LAW_GO_KR}/LSW/lsInfoP.do?lsId=${encodeURIComponent(lawId)}`;
}

export function lawArticleUrl(lawName: string, article?: string): string {
  if (article) {
    return `${LAW_GO_KR}/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(article)}`;
  }
  return `${LAW_GO_KR}/법령/${encodeURIComponent(lawName)}`;
}

export function precedentUrl(precSeq: string): string {
  return `${LAW_GO_KR}/LSW/precInfoP.do?precSeq=${encodeURIComponent(precSeq)}`;
}

export function adminRuleUrl(ruleSeq: string): string {
  return `${LAW_GO_KR}/LSW/admRulInfoP.do?admRulSeq=${encodeURIComponent(ruleSeq)}`;
}

/** PIPC 의결문 (target=ppc, ppcSeq) */
export function pipcDecisionUrl(decisionSeq: string): string {
  return `${LAW_GO_KR}/LSW/ppcInfoP.do?ppcSeq=${encodeURIComponent(decisionSeq)}`;
}

/** 헌재결정례 (target=detc, detcSeq) */
export function constitutionalDecisionUrl(detcSeq: string): string {
  return `${LAW_GO_KR}/LSW/detcInfoP.do?detcSeq=${encodeURIComponent(detcSeq)}`;
}

/** 행정심판례 (target=decc, deccSeq) */
export function adminAppealUrl(deccSeq: string): string {
  return `${LAW_GO_KR}/LSW/deccInfoP.do?deccSeq=${encodeURIComponent(deccSeq)}`;
}

/** 법령해석례 (target=expc, expcSeq) */
export function interpretationUrl(expcSeq: string): string {
  return `${LAW_GO_KR}/LSW/expcInfoP.do?expcSeq=${encodeURIComponent(expcSeq)}`;
}

export function privacyCaseUrl(nttId: string): string {
  // PIPC 사이트 query param은 camelCase (nttNo·nttId).
  // snake_case(`ntt_id`)로 보내면 default 사례로 fallback되는 quirk 있음.
  return `${PRIVACY_GO_KR}/front/case/view.do?nttNo=1&nttId=${encodeURIComponent(nttId)}`;
}

/** 일반 법제처 법령 인용 (법률·시행령·시행규칙) */
export function formatLawAttribution(lawName: string, article?: string): string {
  return `📎 출처: ${lawName}${article ? ` ${article}` : ""} (${lawArticleUrl(lawName, article)})`;
}

/**
 * 행정규칙(고시·훈령·예규) 인용. 법령과 달리 `/법령/한글주소` 경로 미지원이므로
 * `admRulSeq` 기반 URL 사용. 한글주소 사용 시 "한글주소 미등록" 에러.
 */
export function formatAdminRuleAttribution(
  ruleName: string,
  ruleSeq?: string
): string {
  const url = ruleSeq ? ` (${adminRuleUrl(ruleSeq)})` : "";
  return `📎 출처: ${ruleName}${url}`;
}

/**
 * Layer C — PIPC 가이드·상담사례 인용. pipc-attribution 라이선스 준수.
 * data/hf_dataset/LICENSE.md 의 출처 표시 의무 자동 충족.
 */
export interface PipcAttributable {
  doc_title: string;
  source_url?: string;
  source_pdf?: string;
  pages?: string;
  ntt_id?: string;
}

export function formatPipcAttribution(record: PipcAttributable): string {
  const parts = [`📎 출처: 개인정보보호위원회, 「${record.doc_title}」`];
  if (record.pages) parts.push(record.pages);

  let url = record.source_url;
  if (!url && record.ntt_id) url = privacyCaseUrl(record.ntt_id);
  if (!url && record.source_pdf) url = `${PRIVACY_GO_KR} (PDF: ${record.source_pdf})`;
  if (url) parts.push(`(${url})`);

  return parts.join(" ");
}
