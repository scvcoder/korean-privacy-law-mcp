# korean-privacy-law-mcp

대한민국 개인정보보호법(PIPA) 전문 MCP. PIPA·시행령·PIPC 고시·의결례·공식 가이드·상담사례 + 법제처 전체 API 를 도메인 추론 도구와 함께 제공한다. 일반 법령 MCP 가 못 다루는 도메인 깊이가 차별화 축이다.

## 프로젝트 정체성

- **차별화 축**: 개인정보 도메인 자체의 깊이. 특별법 우선 원칙, 시점 분기(정보통신망법→PIPA 흡수), 4계층 위임(법·시행령·시행규칙·PIPC 고시), PIPC 의결례 구조화, **PIPC 공식 RAG 코퍼스** 2,202 청크 (가이드 457 + 상담사례 1,745, Contextual Retrieval 적용), **4계층 환각 검증**.
- **메타 철학**: LLM-driven discovery. 깔끔한 primitive 와 derive 불가능한 메타지식 (PIPC 공식 출처 인덱스, RAG 코퍼스, 환각 검증) 만 제공. 게이트·매트릭스로 LLM 추론을 가두지 않는다.
- **타깃**: 개인정보 보호 실무자 (CPO · 법무 · 컴플라이언스).

## 아키텍처 결정

- **From scratch**: import·fork 의존 0. 외부 의존은 일반 npm 라이브러리만.
- **MCP 노출 모델**: 모든 도구 직노출. `discover_tools`/`execute_tool` 같은 게이트 없음. LLM 이 도구 description 으로 직접 라우팅.
- **체인 없음**: 사용 패턴이 쌓이면 추가. premature abstraction 회피.
- **결정 매트릭스 없음**: 적용법령·우선적용 매트릭스를 정적 데이터로 코드화하지 않는다. 법제처의 `get_related_laws`·`get_intelligent_related_laws`·`get_delegated_laws` API 가 대체. 우리 큐레이션 0 — PIPC 공식 출처만 인덱스화.
- **stitching·키워드 추출·유사도 도구 없음**: Opus 4.7급 LLM 은 primitive·corpus 조합으로 자율 수행. 정형화 시 정보 손실 + 편향 위험.

## 도구 인벤토리 — 37개

### Layer A — Primitives (31개, 법제처 API wrapper)

| 카테고리 | 도구 |
|---|---|
| 법령 검색·본문 | `search_law`, `get_law_text`, `intelligent_law_search`, `get_annexes`, `get_historical_law` |
| 관계·구조 | `get_related_laws`, `get_intelligent_related_laws`, `get_delegated_laws`, `get_law_system_tree`, `get_law_tree` |
| 시간축 | `get_law_history`, `get_article_change_history`, `compare_old_new`, `get_three_tier` |
| 비교 | `compare_articles` |
| 행정규칙 | `search_admin_rule`, `get_admin_rule_text`, `compare_admin_rule_old_new` |
| 결정문 | `search_pipc_decisions`, `get_pipc_decision_text`, `search_constitutional_decisions`, `get_constitutional_decision_text`, `search_admin_appeals`, `get_admin_appeal_text` |
| 해석례 | `search_interpretations`, `get_interpretation_text` |
| 영문 | `search_english_law`, `get_english_law_text` |
| 용어·약칭 | `get_legal_term`, `get_term_articles`, `get_law_abbreviations` |

### Layer B+ — PIPC 공식 출처 인덱스 (2개)

PIPC 가 직접 게시한 공식 표·portal list 만 인덱스화. 우리 큐레이션·해석 0 — 권위 효과 편향 차단.

- **`get_sectoral_related_laws(sector?)`** — 분야별 PIPC 매핑 lookup
  - 출처: 「분야별 개인정보 보호 안내서」 (PIPC, 2024.12) 8개 분야 정형 표
  - `official_laws` (PIPC 공식 분류, 권위) vs `additional_mentions` (본문 빈도 통계, 참고) 분리
  - 분야: 인사·노무·사회복지시설·의료기관·약국·학원·교습소·통계작성·공공기관·온라인경품
  - 별칭(병원→의료기관 · 감사→공공기관 등) 자동 정규화
  - lex specialis 원칙 PIPC 직접 인용 (예: "특별법(의료법 등)을 우선 적용")
- **`get_pipc_curated_corpus(category?)`** — PIPC 일반 도메인 출발점
  - 출처: 개인정보 포털 (privacy.go.kr/contsNo=116·117) 12 법령 + 23 행정규칙
  - PIPC 가 portal 에 직접 게시한 list 그대로

**편향 차단 baseline (모든 응답 자동 첨부)**:
- 출처·페이지·발간일 (사용자 검증 가능)
- "추가 검토 필수" 면책
- 다음 도구 anchoring (`search_law`·`intelligent_law_search`·다른 분야)
- 분야 미수록 시 `[NOT_FOUND_SCOPE]` + 대체 도구 → LLM 자율 검색 유도

### Layer C — RAG Corpus (3개)

`data/hf_dataset/` 5개 jsonl → 2,202 청크 (Contextual Retrieval 적용). 부팅 시 BM25 인덱스 메모리 빌드 (한국어 토크나이저, prefix + fuzzy 0.2). 법제처 API 가 못 가진 실무 자료.

| 청크 분포 | 개수 |
|---|---|
| 분야별 개인정보 보호 안내서 (2024.12) | 246 |
| 개인정보 질의응답 모음집 (2025.12) | 99 |
| 고정형 영상정보처리기기 설치·운영 안내서 (2024.12) | 71 |
| 소상공인을 위한 개인정보 보호 핸드북 (2024.12) | 41 |
| 개인정보 포털 상담사례 (privacy.go.kr) | 1,745 |
| **합계** | **2,202** |

- **`search_privacy_corpus`** — 가이드 + 사례 통합. LLM 첫 진입에 가장 자연스러운 도구
- **`search_privacy_guides(doc_type?)`** — PIPC 공식 가이드 4종 (`doc_type` ∈ `qa, small_business, cctv, sectoral`)
- **`search_privacy_cases`** — privacy.go.kr 상담사례 (`category1/2/3` · `year_range` 필터, 처리자(민간/공공) × 처리행위 × 분야 트리)

응답 포맷: `chunk_context` + `body` 발췌 + `📎 출처: 개인정보보호위원회, 「...」 (privacy.go.kr/...)` 자동 첨부 (pipc-attribution 라이선스 준수).

### Validator (1개)

- **`verify_pipa_citation(citation, as_of?)`** — 4계층 환각 검증 (법령 → 조 → 항 → 호·목)
  - 인용 파싱: `parseCitation` 이 `§·①·호` 약식 자동 정규화
  - 법령명: PRIVACY_ALIASES 자동 (PIPA·개보법·정통망법 등 17종)
  - `as_of` YYYYMMDD: efYd 로 시점별 본문 조회 (예: 2019년 정통망법 §22 유효 여부)
  - 환각 시 `[HALLUCINATION_DETECTED]` + 단계별 ✗ + 다음 도구 (`get_law_text`·`get_law_tree`)
  - 성공 시 ✅ + 4계층 ✓ + mst·lawId + 📎 출처

## 응답 Baseline — 모든 도구 공통

1. **머신 파싱 마커**: `[NOT_FOUND]` / `[HALLUCINATION_DETECTED]` / `[OUT_OF_SCOPE]` / `[NOT_FOUND_SCOPE]` 4종 표준화. LLM 환각 차단.
2. **`isError: true` 정확 세팅**: MCP 스펙 준수. 실패와 빈 결과 구분.
3. **다음 도구 후보 자동 노출**: 응답 끝에 인자 예시 포함. 체인 없이도 LLM 이 자연스럽게 이어감.
4. **정규 URL 첨부**: `📎 출처: https://www.law.go.kr/...` (Layer A) 또는 `📎 출처: 개인정보보호위원회, 「...」 (privacy.go.kr/...)` (Layer C, pipc-attribution).
5. **API 키 마스킹**: 에러 로그에 `OC=***` 처리.
6. **편향 차단 (Layer B+ 전용)**: PIPC 출처 명시 + "추가 검토 필수" 면책 + 다음 도구 anchoring → 권위효과 편향 차단.

## 도메인 외 질의 처리

Hard gate 아닌 **soft signaling**. 레이어별로 다르게 동작.

| 레이어 | 도메인 외 동작 | 의도 |
|---|---|---|
| Layer A — Primitives | 정상 작동 (전체 법령 조회 가능) | 법제처 API 그대로 노출, 게이트 X |
| Layer B+ — PIPC 출처 인덱스 | `[NOT_FOUND_SCOPE]` + 대체 도구 안내 | PIPC 공식 매핑 8개 분야만 |
| Layer C — RAG Corpus | 자연 0 매칭 + 안내 | 코퍼스가 개인정보 자료뿐 |
| Validator | `[OUT_OF_SCOPE]` | PIPA 인용 검증 전용 |

3가지 신호 메커니즘:

1. **도구 description 도메인 표시** — Layer A: "본 MCP 는 개인정보 분야 우선이지만 일반 법령 검색에도 사용 가능". Layer B+/Validator: "PIPA 전용. 일반 법령은 `search_law` 사용".
2. **응답 마커 4종** — 위 표 참고.
3. **server-level 메타 정보** — `server.info.description` 에 도메인 명시. LLM 이 첫 ListTools 시 자동 인지.

## 라이브러리·패턴

### 파서·정규화 (`src/lib/`)
- `citations.ts` — 인용 추출 시 30자 lookback regex (직전 법령명 역추적), 원숫자(①②③) 항번호 파싱 (법제처 API quirk), 조·항·호·목 파싱: "제15조제1항제2호" → `{조:15, 항:1, 호:2}`
- `aliases.ts` — `PRIVACY_ALIASES` 17 entries (개보법·정통망법·신정법·위치정보법·통비법·정보공개법·전자정부법 등). `search_law`·`get_law_history`·`get_annexes`·`get_law_abbreviations` fallback 에서 자동 적용. 법제처 lsAbrv 사전이 도메인 약칭 거의 미수록 (`정통망법` 등 통용 약칭 미등록, PIPA 자체도 사전 부재) 이라 보완 역할.
- `compact.ts` — PIPC 의결문 본문 계단식 축약: 앞 800자 + 중략 + 뒤 400자 (의결문 평균 1만자+)
- `corpus-index.ts` — lazy singleton, 5 jsonl → 2,202 청크 BM25 인덱스 (한국어 토크나이저, prefix + fuzzy 0.2)
- `external-links.ts` — 정규 URL + PIPC attribution 자동 생성
- `not-found.ts` — `[NOT_FOUND]` / `[NOT_FOUND_SCOPE]` 표준 마커
- `suggestions.ts` — 응답 끝 다음 도구 후보 생성
- `sectoral-laws-data.ts` — `data/related_laws.jsonl` lazy load + sector 별칭 정규화
- `errors.ts` — `formatToolError`, OC 키 마스킹
- `env.ts` — `.env` 자동 로드 (cwd → script-relative `../.env` fallback)

### API 클라이언트 quirk (`src/client/`)
- 짧은 법령명 검색 시 `display=100` 강제 (API 후순위 quirk)
- 영문 법령은 XML 강제 (JSON 0바이트 quirk)
- PIPC 결정문 root tag case-sensitive (`<Ppc>` vs `<ppc>` 공존)
- 행정심판례 root 는 `PrecService` (DeccService 아님)
- `lsAbrv` 는 query/display/page 무시 — 항상 2,668건 1.2MB+ 덤프 → 24h 모듈 캐시 + 클라이언트 측 필터

## 안티패턴 — 명시적으로 피함

- `discover_tools` + `execute_tool` 2-tool 게이트 (5~15초 왕복 손실)
- 미리 정의한 generic chain (사용 패턴 보고 추가)
- 키워드 라우터 — LLM 이 description 으로 라우팅
- 도메인 분류기 — 개인정보 분야 무관
- 노출 도구 set 분리 — 모든 도구 평등 노출
- 풀스캔 catch-all 인덱스 — `intelligent_law_search` API 가 대체
- 적용법령 결정 매트릭스 — LLM 에 위임
- 우리 큐레이션 매핑 (Layer B hint) — 권위 효과 편향. PIPC 공식 출처 인덱스화로 대체.
- stitching·키워드 추출·유사도 도구 (Layer A+) — Opus 4.7급 LLM 이 직접 더 잘 수행

## 기술 스택

```
@modelcontextprotocol/sdk    MCP 프로토콜
zod + zod-to-json-schema     스키마 → JSON Schema 변환
fast-xml-parser              법제처 XML 응답 파싱
minisearch                   Layer C RAG 코퍼스 BM25 인덱스 (메모리)
typescript                   타입
vitest                       테스트
```

## 디렉터리 구조

```
src/
  index.ts                       진입점 (.env 로드 → stdio 서버 시작)
  server.ts                      MCP 서버 부트스트랩 (ListTools/CallTool 핸들러)
  client/
    law-api-client.ts            법제처 fetcher (retry · OC 키 마스킹 · display=100 강제)
    xml-parse.ts                 fast-xml-parser wrapper
  tools/
    registry.ts                  ALL_TOOLS 배열 + findTool lookup
    types.ts                     Tool 인터페이스
    primitives/                  Layer A 31개
    hints/                       Layer B+ 2개 (get_sectoral_related_laws · get_pipc_curated_corpus)
    corpus/                      Layer C 3개 (search_privacy_corpus · cases · guides)
    validator/                   verify-pipa-citation.ts
  lib/
    citations.ts · aliases.ts · compact.ts · corpus-index.ts
    external-links.ts · not-found.ts · suggestions.ts
    sectoral-laws-data.ts · errors.ts · env.ts
data/
  related_laws.jsonl             Layer B+ 데이터 (sectoral_related_laws + portal_corpus)
  related_laws.flat.backup.jsonl 백업
  hf_dataset/                    Layer C 코퍼스 (jsonl 5종, 2,202 청크)
    LICENSE.md                   pipc-attribution
    README.md
    개인정보_질의응답_모음집(2025.12.).jsonl
    소상공인을_위한_개인정보 보호_핸드북(2024.12).jsonl
    고정형 영상정보처리기기_설치_운영_안내서(2024.12).jsonl
    분야별_개인정보_보호_안내서(2024.12).jsonl
    개인정보포털_상담사례.jsonl
tests/
  client/ · lib/ · tools/ · integration/ · regression/
  server.test.ts · smoke.test.ts
docs/
  CLAUDE_DESKTOP.md              사용자용 단계별 설정 가이드
README.md                        설치·인증·사용 + 라이선스
LICENSE                          MIT
```

## 핵심 참조

- PIPC 공식 관련 법령: https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=116
- PIPC 공식 관련 행정규칙: https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=117
- 법제처 OPEN API 가이드 (191개): https://open.law.go.kr/LSO/openApi/guideList.do
- Layer C 데이터셋: https://huggingface.co/datasets/scvcoder/korean-privacy-law-corpus (로컬 사본 `data/hf_dataset/`)

## 법제처 OPEN API 매핑

`https://open.law.go.kr/LSO/openApi/guideList.do` 카탈로그를 PIPA 도메인 관점에서 분류. 새 도구 추가 시 endpoint·target·quirk 참조용.

### 사용 (Layer A 31개 도구가 호출)

| API 카테고리 | endpoint·target | 매핑 도구 |
|---|---|---|
| 현행법령(시행일) 목록 | lawSearch.do · law | `search_law` |
| 현행법령(시행일) 본문 | lawService.do · law (JSON) | `get_law_text` |
| 현행법령 조항호목 | lawService.do · law + JO 6자리 (조4+가지2) | `compare_articles` (각 사이드 fetch) |
| 영문 법령 목록 | lawSearch.do · elaw (HTML strip 필요) | `search_english_law` |
| 영문 법령 본문 | lawService.do · elaw (**XML 강제 — JSON 0바이트 quirk**, root `<Law><InfSection>+<JoSection><Jo>`) | `get_english_law_text` |
| 법령 연혁 목록 | lawSearch.do · **eflaw** (lsHist 는 HTML 만 반환) | `get_law_history` |
| 시점별 법령 본문 | lawService.do · law + MST=시점mst | `get_historical_law` |
| 일자별 조문 개정 이력 | lawSearch.do · lsJoHstInf (**fromRegDt+toRegDt 필수**, JO 6자리 자동 정규화) | `get_article_change_history` |
| 위임법령 | **lawService.do · lsDelegated** + ID=법령ID | `get_delegated_laws` |
| 법령 체계도 | lawService.do · lsStmd (JSON) | `get_related_laws` (평탄) · `get_law_system_tree` (트리) |
| 법령 본문 (목차 추출) | lawService.do · law (JSON, 조문여부=전문 헤더만) | `get_law_tree` (편·장·절 navigation) |
| 신구법 본문 | lawService.do · oldAndNew (root OldAndNewService, `<P>` → markdown bold) | `compare_old_new` |
| 3단 비교 | lawService.do · thdCmp + knd=1·2 (knd 별 root prefix 다름: ThdCmp vs LspttnThdCmp) | `get_three_tier` |
| 법령명 약칭 | lawSearch.do · lsAbrv (**query/display/page 무시 — 항상 2,668건 1.2MB+ 덤프**, 24h 모듈 캐시) | `get_law_abbreviations` |
| 행정규칙 목록 | lawSearch.do · admrul | `search_admin_rule` |
| 행정규칙 본문 | lawService.do · admrul (**ID=행정규칙일련번호 ≠ 행정규칙ID**, 기본정보 키=`행정규칙기본정보`) | `get_admin_rule_text` |
| 행정규칙 신구법 비교 | lawService.do · admrulOldAndNew (root AdmRulOldAndNewService) | `compare_admin_rule_old_new` |
| 헌재결정례 목록 | lawSearch.do · detc (rootTag DetcSearch, **itemTag Detc 대문자**) | `search_constitutional_decisions` |
| 헌재결정례 본문 | lawService.do · detc (root DetcService) | `get_constitutional_decision_text` |
| 법령해석례 목록 | lawSearch.do · expc (root Expc) | `search_interpretations` |
| 법령해석례 본문 | lawService.do · expc (root ExpcService) | `get_interpretation_text` |
| 행정심판례 목록 | lawSearch.do · decc (root Decc) | `search_admin_appeals` |
| 행정심판례 본문 | lawService.do · decc (**root PrecService — DeccService 아님**) | `get_admin_appeal_text` |
| PIPC 결정문 목록 | lawSearch.do · ppc (root Ppc, **case-sensitive**: `<Ppc>` vs `<ppc>` 공존) | `search_pipc_decisions` |
| PIPC 결정문 본문 | lawService.do · ppc (root PpcService.의결서) | `get_pipc_decision_text` |
| 별표·서식 목록 | lawSearch.do · **licbyl** + search=2 (lawByl 아님 — 0바이트 응답) | `get_annexes` |
| 법령용어 목록 | lawSearch.do · lstrm (검색) | `get_legal_term` (검색 단계) |
| 법령용어 본문 | **lawService.do · lstrm + trmSeqs=콤마구분** (평탄 XML, 필드 순서 zip 매칭) | `get_legal_term` (정의 fetch) |
| 법령용어-조문 연계 | **lawService.do · lstrmRltJo** (lawSearch 아님, lstrmRlt 와 별개) | `get_term_articles` |
| 지능형 법령검색 | lawSearch.do · aiSearch (**totalCntTag=검색결과개수**) | `intelligent_law_search` |
| 지능형 연관법령 | lawSearch.do · aiRltLs (search 0/1 분기) | `get_intelligent_related_laws` |

### 통합 사용 — 부처별 해석례

법제처는 ~30개 부처별 해석 API 를 별도 endpoint 로 제공하지만 우리는 **통합 endpoint(`expc`)** 하나로 전 부처 검색. 부처별 개별 도구 불필요.

### 의도적 제외 (PIPA 도메인 외)

| API 카테고리 | 제외 이유 |
|---|---|
| 자치법규 (목록·본문·연계·별표) | CCTV 운영 조례 정도 외 PIPA 영향 작음 |
| 조약 | 한-EU 적정성 결정 등은 향후 국외 API (EUR-Lex) 로 직접 처리 |
| 학칙·공단·공공기관 | 별도 ALIO MCP 가 처리 (host composition) |
| 위원회 결정문 — PIPC 외 11종 (FTC·노동위·국민권익위·금융위·고보심·노동위·방통위·산재재심사·중토수·중환분쟁·증선·인권위) | PIPA 무관 |
| 특별행정심판 (조세심판원·해양안전심판원·소청심사) | PIPA 도메인 외 |
| 감사원 사전컨설팅 의견서 | PIPA 도메인 외 |
| 모바일 API | 표준 endpoint 와 동일 데이터 변형 |
| 현행법령(공포일) | 시행일 기준이 도메인 표준, 공포일은 edge case |
| 일반 판례 (법원 판례, target=prec) | PIPA 직접 인용 판례는 헌재·행심으로 충분 |

## 작업 가이드

- 새 도구 추가 시 1순위 평가축: "기존 일반 MCP 가 못 하는가?". 못 한다면 도메인 깊이가 있는 것 — primitive·corpus·검증 중 어느 카테고리에 속하는지 분류.
- description 4요소 명시: 무엇을 · 언제 · 다음 도구 · 한계. `[NOT_FOUND]` 시그널 패턴 일관.
- 테스트는 법제처 API 실호출 + 스냅샷 위주. mock 위주 X.
- `data/*.jsonl` 큐레이션 데이터는 코드 리뷰와 별도 검토 절차. PIPC 공식 출처를 그대로 인덱스화 — 우리 해석 추가 금지.
- 새 layer 추가는 신중히. 현재 4개 (Primitives · PIPC 인덱스 · RAG · Validator) 가 전부 *원본 기반* — 우리 큐레이션 0 원칙 유지.
