# Korean Privacy Law MCP — API Reference

> **v0.8** | 37개 도구

도구 카테고리 요약: [README.md](../README.md#-도구-구조-37개)
파라미터 상세 (Zod 스키마): `src/tools/**/*.ts`

---

## 공통 사항

### 응답 마커 (4종)

조회 실패·환각·도메인 외 입력을 LLM 이 빈 문자열로 메우지 않도록 응답 prefix 로 명시합니다.

| 마커 | 의미 | 반환 시점 |
|---|---|---|
| `[NOT_FOUND]` | 조회 실패 / 결과 없음 | 일반적인 빈 결과 |
| `[HALLUCINATION_DETECTED]` | 4계층 검증 실패 | `verify_pipa_citation` 의 단계별 ✗ |
| `[OUT_OF_SCOPE]` | 도메인 외 입력 | Validator 가 PIPA 외 입력 받았을 때 |
| `[NOT_FOUND_SCOPE]` | 분야 미수록 | Layer B+ 가 8개 분야 외 sector 입력 받았을 때 |

모든 성공 응답에는 `📎 출처` 정규 URL + "다음 도구 후보" 가 자동 첨부됩니다.

### ID 형식

| 유형 | 필드 | 형식 | 예시 |
|---|---|---|---|
| 법령 | `mst` (법령일련번호) | 6자리 | `279811` |
| 법령 | `lawId` | 6자리 | `001556` |
| 행정규칙 | `mst` (행정규칙일련번호) | 13자리 | `2100000261222` |
| 결정문·해석례·헌재·행심 | `id` | 6자리 | `609561` |

> 행정규칙 본문 조회는 **일련번호** 만 동작 — `행정규칙ID` (짧은 번호) 사용 시 0바이트 응답 quirk.

### JO 코드 (조문번호)

법제처 API 의 6자리 코드 `AAAABB`:
- `AAAA`: 조 번호 (0001~9999)
- `BB`: 가지 번호 (00~99)

```
제15조       → 001500
제28조의2    → 002802
제22조의2    → 002202
```

`compare_articles` · `verify_pipa_citation` 등은 한글 표현 (`제15조`·`제28조의2`) 도 자동 정규화합니다.

### 시점 검증 파라미터

YYYYMMDD 8자리. 그 시점에 시행 중이던 본문 또는 그 시점의 인용 유효성 검증.

| 도구 | 파라미터 | 용도 |
|---|---|---|
| `get_law_text` · `get_law_tree` · `compare_articles` | `efYd` | 그 시점 본문 |
| `verify_pipa_citation` | `as_of` | 그 시점 인용 조문 유효 여부 |
| `get_article_change_history` | `fromRegDt` · `toRegDt` | 기간 내 개정 이력 |

### 도메인 약칭 17종 (PRIVACY_ALIASES)

다음 약칭이 자동 정규화 — `search_law`·`get_law_history`·`get_annexes`·`get_law_abbreviations`·`verify_pipa_citation` 입력에서 그대로 사용 가능:

| 정식 법령명 | 약칭 |
|---|---|
| 개인정보 보호법 | `PIPA` · `개보법` · `개인정보법` · `개인정보보호법` |
| 개인정보 보호법 시행령 | `개보법 시행령` · `PIPA 시행령` |
| 개인정보 보호법 시행규칙 | `개보법 시행규칙` |
| 정보통신망 이용촉진 및 정보보호 등에 관한 법률 | `정보통신망법` · `정통망법` · `정통법` |
| 신용정보의 이용 및 보호에 관한 법률 | `신용정보법` · `신정법` |
| 위치정보의 보호 및 이용 등에 관한 법률 | `위치정보법` · `위정법` |
| 통신비밀보호법 | `통비법` |
| 전기통신사업법 | `전사법` |
| 공공기관의 정보공개에 관한 법률 | `정보공개법` |
| 공공기관의 운영에 관한 법률 | `공공기관운영법` · `공운법` |
| 국가인권위원회법 | `인권위법` |
| 초·중등교육법 | `초중등교육법` |
| 의료법 · 전자정부법 · 전자서명법 · 주민등록법 · 지방공기업법 · 고등교육법 | (정식명만) |

법제처 `lsAbrv` 사전이 도메인 약칭 거의 미수록 (예: `정통망법` 미등록) 이라 이 보완 사전이 자동 적용됩니다.

### 에러 응답

```json
{
  "content": [{"type": "text", "text": "[에러코드] 도구명: 메시지\n\n💡 해결: ..."}],
  "isError": true
}
```

- 환경변수 `LAW_OC` 미설정 시 stderr 경고만 출력 (서버는 기동 — Layer C 일부 동작 가능).
- 에러 로그에 OC 키 자동 마스킹 (`OC=***`).

### 응답 크기 제한

| 유형 | 한도 |
|---|---|
| 법령 본문 | 12,000자 |
| PIPC 의결문 본문 | 1만자+ → 앞 800 + 중략 + 뒤 400 계단식 축약 |
| 검색 결과 | 도구별 5~100건 (각 도구 `display` 파라미터) |

### 캐싱

| 데이터 | TTL | 저장 위치 |
|---|---|---|
| `lsAbrv` 약칭 사전 (2,668건) | 24h | 모듈 내 메모리 |
| Layer C 코퍼스 BM25 인덱스 (2,202 청크) | 부팅 시 1회 빌드 | 메모리 (lazy singleton) |
| 법제처 일반 응답 | 캐시 없음 | 매 요청 fresh |

---

## 도구 카테고리

### 법령 검색·본문·구조 (10)

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `search_law` | `query` (약칭 자동) · `display`=100 · `page` · `sort?` | 법령명 키워드 검색. 짧은 법령명 후순위 quirk 회피 위해 `display=100` 강제. |
| `get_law_text` | `mst`\|`lawId` · `efYd?` | 법령 본문 조회 (조문·항·호·목). `efYd` 로 시점별 본문. |
| `intelligent_law_search` | `query` (자연어) · `search`=0 · `display`=20 | AI 지능형 법령검색 (조문 본문 매칭). `search` 0/1/2/3 = 법령조문/별표/행정규칙조문/행정규칙별표. |
| `get_annexes` | `lawName` (약칭) · `knd`=5 · `display`=100 | 별표·서식 목록 + HWP/PDF 다운로드 링크. `knd` 1/2/3/4/5 = 별표/서식/부칙별표/부칙서식/전체. |
| `get_historical_law` | `mst` | 특정 시점 mst 의 본문 (`get_law_history` 결과의 시점별 mst 사용). |
| `get_related_laws` | `mst`\|`lawId` | 관련 법령·시행령·시행규칙·고시·훈령·예규 평탄 list (체계도). |
| `get_intelligent_related_laws` | `query` · `search`=0 · `display` | AI 의미 기반 연관 법령 추천. |
| `get_delegated_laws` | `lawId` | 위임법령 — 본법 조문 ↔ 위임 받는 시행령·시행규칙 조문 매핑. |
| `get_law_system_tree` | `mst`\|`lawId` | 법체계도 트리 시각화 (상하위법·관련법령). |
| `get_law_tree` | `mst`\|`lawId` · `efYd?` | 법령 내부 편·장·절·관 navigation 트리. |

### 개정 이력 추적 (4)

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `get_law_history` | `lawName` · `display`=100 | 같은 법령의 모든 시행일 버전 list (현행·연혁·시행예정). |
| `get_article_change_history` | `lawId` · `jo?` · `fromRegDt?`·`toRegDt?` | 일자별 조문 개정 이력. `fromRegDt` 미지정 시 자동 10년 전부터. |
| `compare_old_new` | `mst` | 신구법 비교 본문 (현행 또는 연혁 mst 둘 다 수용). |
| `get_three_tier` | `mst` (본법) · `knd`=2 | 법-시행령-시행규칙 3단 비교. `knd` 1=인용 / 2=위임 (기본). |

### 조문 비교 (1)

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `compare_articles` | `left{mst,jo,efYd?}` · `right{mst,jo,efYd?}` | 두 조문 1:1 대비. `jo` 는 한글(`제15조`) / 6자리 JO코드(`001500`) 모두 수용. |

### 행정규칙 (3)

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `search_admin_rule` | `query` · `display`=100 · `page` | 고시·훈령·예규 검색. PIPC 고시 8개 + 부처별 개인정보보호 훈령 22개가 핵심. |
| `get_admin_rule_text` | `mst` (일련번호) | 행정규칙 본문. **일련번호** 필요 (행정규칙ID 와 다름). |
| `compare_admin_rule_old_new` | `mst` | 행정규칙 신구 비교. |

### 결정문·해석례 (8)

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `search_pipc_decisions` | `query` · `display`=20 · `page` | PIPC (개인정보보호위원회) 의결례 검색. |
| `get_pipc_decision_text` | `id` | PIPC 의결문 본문. 1만자+ 평균 → 앞 800 + 중략 + 뒤 400 계단식 축약. |
| `search_constitutional_decisions` | `query` · `display`=20 · `page` | 헌재 결정례 검색. |
| `get_constitutional_decision_text` | `id` | 헌재 결정례 본문. |
| `search_admin_appeals` | `query` · `display`=20 · `page` | 행정심판 재결례 검색. |
| `get_admin_appeal_text` | `id` | 행정심판 재결례 본문. |
| `search_interpretations` | `query` · `display`=20 · `page` | 부처 법령해석례 통합 검색 (~30개 부처 `expc` 단일 endpoint). |
| `get_interpretation_text` | `id` | 법령해석례 본문. |

### 영문 법령 (2)

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `search_english_law` | `query` (영문/한글) · `display`=50 · `page` | 영문 법령 목록. |
| `get_english_law_text` | `mst` | 영문 법령 본문 (XML 강제 — JSON 0바이트 quirk). `lawId` 파라미터 작동 안 함. |

### 용어·약칭 (3)

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `get_legal_term` | `query` · `display`=5 · `page` · `withDefinitions`=true | 법령용어 검색 + 본문 정의 자동 첨부 (lstrm 검색 → 본문 zip 매칭). |
| `get_term_articles` | `query` (정확 용어명) · `maxArticles`=20 · `includeBody?` | 용어-조문 연계 (lstrmRltJo). |
| `get_law_abbreviations` | `query?` · `exact`=false · `display` | 법령 약칭 ↔ 정식명 양방향 검색. 미지정 시 등록 순 dump. PRIVACY_ALIASES fallback. |

### PIPC 공식 분야별 매핑 (2)

PIPC 가 직접 게시한 표·portal list 만 인덱스화 (큐레이션 0). 모든 응답에 출처·페이지·발간일·"추가 검토 필수" 면책·다음 도구 anchoring 자동 첨부.

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `get_sectoral_related_laws` | `sector?` · `include_additional`=true | 분야별 PIPC 매핑. 미지정 시 8개 분야 list, 지정 시 `official_laws` (PIPC 공식 분류) + `additional_mentions` (본문 빈도 통계). |
| `get_pipc_curated_corpus` | `category`=all (`law`\|`admrul`\|`all`) | 개인정보 포털 (privacy.go.kr/contsNo=116·117) 등록 12 법령 + 23 행정규칙. |

지원 분야 (별칭 자동 정규화 — 병원→의료기관 · 감사→공공기관 등):

`인사·노무` · `사회복지시설` · `의료기관` · `약국` · `학원·교습소` · `통계작성` · `공공기관` · `온라인경품`

미수록 분야 입력 시 `[NOT_FOUND_SCOPE]` + 대체 도구 (`search_law`·`intelligent_law_search`) 안내.

### PIPC 가이드·상담사례 검색 (3)

부팅 시 BM25 인덱스 메모리 빌드 (한국어 토크나이저, prefix + fuzzy 0.2). 모든 응답에 `📎 출처: 개인정보보호위원회, ... (privacy.go.kr/...)` attribution 자동 첨부.

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `search_privacy_corpus` | `query` · `display`=5 · `source_type`=all (`guide`\|`case`\|`all`) | 가이드 + 상담사례 통합 (LLM 첫 진입에 가장 자연스러움). |
| `search_privacy_guides` | `query` · `doc_type`=all · `display` | PIPC 공식 가이드 4종. `doc_type` qa(99) / small_business(41) / cctv(71) / sectoral(246) / all(457). |
| `search_privacy_cases` | `query` · `category1?`·`category2?`·`category3?`·`year_range?` · `display` | 개인정보 포털 상담사례 1,745건. category 트리: 처리자(민간/공공) × 처리행위 × 분야. |

### 인용 조문 검증 (1)

| 도구 | 주요 파라미터 | 설명 |
|---|---|---|
| `verify_pipa_citation` | `citation` · `as_of?` (YYYYMMDD) | 4계층 환각 검증 — 법령 → 조 → 항 → 호·목. 약식(`§15 ① 6호` · `PIPA §15` · `제15조제1항제6호`) 자동 정규화. `as_of` 로 시점별 유효 여부 검증. 환각 시 `[HALLUCINATION_DETECTED]` + 단계별 ✗. |

---

## 워크플로우 예시

### 1. 조문 본문 조회

```
1. search_law(query="개인정보 보호법")
   → mst=279811 획득

2. get_law_text(mst="279811")
   → 본문 + 정규 URL
```

또는 시점별 본문:

```
get_law_text(mst="279811", efYd="20200601")
   → 2020.06.01 시점에 시행 중이던 본문
```

### 2. 4계층 위임 추적 (법-시행령-시행규칙-PIPC 고시)

```
1. search_law(query="개인정보 보호법")
   → mst, lawId 획득

2. get_three_tier(mst=mst, knd="2")
   → 법률 → 시행령 → 시행규칙 위임 관계

3. get_delegated_laws(lawId=lawId)
   → 본법 조문 ↔ 위임받는 하위 조문 매핑

4. search_admin_rule(query="개인정보 안전성 확보조치")
   → PIPC 고시 (4계층 마지막 단계)

5. get_admin_rule_text(mst=고시 일련번호)
   → 고시 본문
```

### 3. 분야별 우선 적용 법령 + 가이드·사례 검색

```
1. get_sectoral_related_laws(sector="의료기관")
   → PIPC 「분야별 안내서」 의 의료기관 표 (의료법 §21·§23 등)
   → 출처·페이지·발간일·면책 자동 첨부

2. search_privacy_guides(query="환자 정보 동의", doc_type="sectoral")
   → 분야별 안내서 본문 청크 검색

3. search_privacy_cases(query="병원 환자 동의", category1="개인정보처리자(민간)")
   → 관련 상담사례
```

### 4. 인용 조문 시점 검증

```
verify_pipa_citation(citation="개인정보 보호법 §28-2", as_of="20200601")
   → [HALLUCINATION_DETECTED]
     §28-2 (가명정보의 처리 등) 는 2020.02.04 신설, 시행 2020.08.05
     2020.06.01 시점에는 아직 시행 전이라 미존재.
   → 다음 도구: get_article_change_history(lawId, jo="28-2")
```

### 5. PIPC 의결례 검색 + 본문 축약

```
1. search_pipc_decisions(query="동의 없는 마케팅")
   → 의결례 list + id

2. get_pipc_decision_text(id=...)
   → 1만자+ 본문이 자동으로 앞 800 + 중략 + 뒤 400 계단식 축약
```

### 6. 신구법 비교

```
1. search_law(query="개인정보 보호법") → mst (현행)

2. get_law_history(lawName="개인정보 보호법")
   → 모든 시행일 버전 list + 시점별 mst

3. compare_old_new(mst=과거 mst)
   → 신구 본문 대조 (markdown)
```

### 7. 조문 1:1 비교 (다른 법령)

```
1. search_law(query="개인정보 보호법") → mst1
2. search_law(query="신용정보법") → mst2
3. compare_articles(
     left={mst: mst1, jo: "제15조"},
     right={mst: mst2, jo: "제32조"}
   )
```

---

## 관련 문서

- [README.md](../README.md) — 시작 가이드
- [CLAUDE_DESKTOP.md](./CLAUDE_DESKTOP.md) — Claude Desktop 단계별 설정 + 트러블슈팅
- [CLAUDE.md](../CLAUDE.md) — 프로젝트 정체성·아키텍처·법제처 OPEN API 매핑 (개발자 onboarding)
