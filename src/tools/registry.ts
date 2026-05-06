/**
 * 모든 도구를 한 곳에서 모아 server에 등록.
 * W1.5: primitive 5개. W2 이후 추가될 도구는 여기에 import만 추가하면 자동으로 노출.
 */

import type { Tool } from "./types.js";
import { searchLaw } from "./primitives/search-law.js";
import { getLawText } from "./primitives/get-law-text.js";
import { intelligentLawSearch } from "./primitives/intelligent-law-search.js";
import { getRelatedLaws } from "./primitives/get-related-laws.js";
import { getAnnexes } from "./primitives/get-annexes.js";
import { searchAdminRule } from "./primitives/search-admin-rule.js";
import { searchPipcDecisions } from "./primitives/search-pipc-decisions.js";
import { searchConstitutionalDecisions } from "./primitives/search-constitutional-decisions.js";
import { searchAdminAppeals } from "./primitives/search-admin-appeals.js";
import { searchInterpretations } from "./primitives/search-interpretations.js";
import { searchEnglishLaw } from "./primitives/search-english-law.js";
import { getAdminRuleText } from "./primitives/get-admin-rule-text.js";
import { getPipcDecisionText } from "./primitives/get-pipc-decision-text.js";
import { getConstitutionalDecisionText } from "./primitives/get-constitutional-decision-text.js";
import { getAdminAppealText } from "./primitives/get-admin-appeal-text.js";
import { getInterpretationText } from "./primitives/get-interpretation-text.js";
import { getEnglishLawText } from "./primitives/get-english-law-text.js";
import { compareAdminRuleOldNew } from "./primitives/compare-admin-rule-old-new.js";
import { getLawHistory } from "./primitives/get-law-history.js";
import { getHistoricalLaw } from "./primitives/get-historical-law.js";
import { compareOldNew } from "./primitives/compare-old-new.js";
import { getThreeTier } from "./primitives/get-three-tier.js";
import { getArticleChangeHistory } from "./primitives/get-article-change-history.js";
import { getDelegatedLaws } from "./primitives/get-delegated-laws.js";
import { getLawSystemTree } from "./primitives/get-law-system-tree.js";
import { getIntelligentRelatedLaws } from "./primitives/get-intelligent-related-laws.js";
import { compareArticles } from "./primitives/compare-articles.js";
import { getLegalTerm } from "./primitives/get-legal-term.js";
import { getTermArticles } from "./primitives/get-term-articles.js";
import { getLawAbbreviations } from "./primitives/get-law-abbreviations.js";
import { getLawTree } from "./primitives/get-law-tree.js";
// W3 — Layer C corpus
import { searchPrivacyCorpus } from "./corpus/search-privacy-corpus.js";
import { searchPrivacyCases } from "./corpus/search-privacy-cases.js";
import { searchPrivacyGuides } from "./corpus/search-privacy-guides.js";
// W3 — Layer B+ hints (PIPC 공식 출처 인덱스화)
import { getSectoralRelatedLaws } from "./hints/get-sectoral-related-laws.js";
import { getPipcCuratedCorpus } from "./hints/get-pipc-curated-corpus.js";
// W4 — Validator (4계층 환각 검증)
import { verifyPipaCitation } from "./validator/verify-pipa-citation.js";

export const ALL_TOOLS: Tool[] = [
  // W1.5
  searchLaw,
  getLawText,
  intelligentLawSearch,
  getRelatedLaws,
  getAnnexes,
  // W2 — search primitives (admin rule + decisions + interpretations + english)
  searchAdminRule,
  searchPipcDecisions,
  searchConstitutionalDecisions,
  searchAdminAppeals,
  searchInterpretations,
  searchEnglishLaw,
  // W2 — get text primitives
  getAdminRuleText,
  getPipcDecisionText,
  getConstitutionalDecisionText,
  getAdminAppealText,
  getInterpretationText,
  getEnglishLawText,
  // W2 — comparison primitives
  compareAdminRuleOldNew,
  compareArticles,
  // W2 — temporal primitives
  getLawHistory,
  getHistoricalLaw,
  compareOldNew,
  getThreeTier,
  getArticleChangeHistory,
  getDelegatedLaws,
  getLawSystemTree,
  getIntelligentRelatedLaws,
  // W2 — terminology primitives
  getLegalTerm,
  getTermArticles,
  getLawAbbreviations,
  // W2.5 — navigation
  getLawTree,
  // W3 — Layer C RAG corpus (PIPC 가이드 + 상담사례, BM25 인덱스)
  searchPrivacyCorpus,
  searchPrivacyCases,
  searchPrivacyGuides,
  // W3 — Layer B+ hints (PIPC 공식 출처 인덱스화)
  getSectoralRelatedLaws,
  getPipcCuratedCorpus,
  // W4 — Validator
  verifyPipaCitation,
];

const TOOL_INDEX = new Map<string, Tool>(ALL_TOOLS.map((t) => [t.name, t]));

export function findTool(name: string): Tool | undefined {
  return TOOL_INDEX.get(name);
}
