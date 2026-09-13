# Changelog — `korean-privacy-law-mcp`

본 프로젝트의 모든 주요 변경사항은 이 파일에 기록됩니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/), 버전은 [Semantic Versioning](https://semver.org/spec/v2.0.0.html) 을 따릅니다.

> RAG 코퍼스 자체의 버전 이력은 별도로 [`data/hf_dataset/CHANGELOG.md`](./data/hf_dataset/CHANGELOG.md) 에서 관리됩니다 (HF 데이터셋 `scvcoder/korean-privacy-law-corpus`).

---

## [0.9.0] - 2026-09-13

> **2026년 PIPC 신규 가이드 3종 RAG 코퍼스 편입 (v1.3)**: 가명정보 처리 가이드라인(2026.3)·개인정보 처리방침 작성지침(2026.4)·공공 AX 프라이버시 보호 안내서(2026.7) 를 청킹해 Layer C 코퍼스가 2,432 → **2,699 청크** (가이드 687 → 954) 로 확장. `search_privacy_guides` 의 `doc_type` 이 4종 → 7종. 기존 데이터는 원출처 대조 결과 변경 없음.

### Added

- **RAG 코퍼스 신규 가이드 3종** ([data/hf_dataset/](./data/hf_dataset/), 데이터셋 v1.3) — 모두 절·항목 단위 청킹 + Contextual Retrieval `chunk_context` 적용.
  - `가명정보_처리_가이드라인(2026.3).jsonl` — **132청크** (본권 제도 안내편 46 + 별권 제도 실무편 86). 가명정보 특례·5단계 가명처리 절차·표준화된 위험도 판단(저·중·고)·비정형데이터 가명처리 기준·Q&A / 결합·반출 절차·안전성 확보조치·가명처리 기술 및 기법·서식 10종·내부관리계획·위탁계약·처리방침 작성 예시·위험도 판단 예시 7건·AI 활용 시나리오 8건·유의사례. `pages` 는 `본권 p.N` / `별권 p.N` 으로 구분.
  - `개인정보_처리방침_작성지침(2026.4).jsonl` — **96청크**. 기재사항 24개 항목별 작성 방법·작성 예시·잘못 작성된 사례, 공개 방법(누리집·사업장·간이형), 주요 개인정보 처리 표시(라벨링), 부록 1~9 (생성형 AI 서비스 처리방침 · 아동용 · 공공기관용 · 소상공인용 · 업종별 알기 쉬운 처리방침 · 브라우저/단말기 차단 방법).
  - `공공_AX_프라이버시_보호_안내서(2026.7).jsonl` — **39청크**. 공공기관 AI 전환 단계별(사전 설계·개발 구축·적용 관리)·유형별(기초업무 보조·정보 연계분석추천·선별판단) 점검, 적법근거 해석, 보호위원회 사전적정성 검토 사례 6건, 기관별 역할·헬프데스크.
- **`search_privacy_guides` `doc_type` 3종 추가** ([src/tools/corpus/search-privacy-guides.ts](./src/tools/corpus/search-privacy-guides.ts)) — `pseudonym` / `privacy_policy` / `public_ax`. enum 5 → 8 (`all` 포함), description 에 각 가이드 범위·청크 수 명시.
- **테스트** — `doc_type` enum 8개 검증 + 신규 3종 각각의 필터 동작 테스트 ([tests/tools/corpus/search-privacy-guides.test.ts](./tests/tools/corpus/search-privacy-guides.test.ts)).

### Changed

- **코퍼스 로더** ([src/lib/corpus-index.ts](./src/lib/corpus-index.ts)) — `CORPUS_FILES` 5 → 8, `DOC_TYPE_ALIAS` 4 → 7. 부팅 시 BM25 인덱스 2,699 청크.
- **`search_privacy_corpus` description** — 가이드 7종·2,699 청크로 갱신.
- **문서** — README(배지·특징·도구 표), CLAUDE.md(청크 분포 표·디렉터리), docs/API.md, huggingface/README.md 의 청크 수·가이드 목록 갱신. 데이터셋 README/CHANGELOG 에 v1.3 항목 추가.

### Verified (데이터 현행화 점검, 2026-09-13)

- 개인정보 포털 관련 법령(contsNo=116) 12건 · 관련 행정규칙(contsNo=117) 23건 — 변경 없음.
- 개인정보 포털 상담사례 — 총 1,745건 · 최신 2025-09-02 (nttNo 313) 로 코퍼스와 동일, 신규 없음.
- 기존 가이드 4종(질의응답 2025.12 · 소상공인 핸드북 2024.12 · CCTV 안내서 2024.12 · 분야별 안내서 2024.12) — PIPC 자료실 기준 여전히 최신판. HF 데이터셋 푸시 시 기존 jsonl 5개 바이트 단위 동일 확인.
- 업스트림 HF 데이터셋 `scvcoder/korean-privacy-law-corpus` 가 v1.2 로 로컬과 동일했으므로 신규분은 원출처 PDF 에서 직접 청킹.

### Deployment

- HF 데이터셋 `scvcoder/korean-privacy-law-corpus` v1.3 태그 푸시.
- HF Space `scvcoder-korean-privacy-law-mcp.hf.space` — v0.0.1(5월 빌드) → v0.8.3 → **v0.9.0** 순차 재배포. 라이브 `doc_type: pseudonym` 검색 확인.

### Notes

- 「개인정보 처리방침 표준(안)」(2026.2) 3종(공인중개사·노인복지관·여행업)은 서식 위주라 청킹 제외 — 작성지침 부록 5 의 업종별 알기 쉬운 처리방침 예시가 같은 내용을 다룸.
- 별권 제7·8장의 서식 작성 예시 청크 8개는 표가 길어 3,000~3,550자 (기존 최대 2,766자). BM25 검색·400자 발췌에는 영향 없음.

---

## [0.8.3] - 2026-05-10

> **버전 표기 동기화 + setup 완료 메시지 정리**: `SERVER_VERSION` 이 0.0.1 로 고정돼 있던 stale 이슈를 package.json 동적 로드로 해결. setup 완료 메시지에 실제 설치 버전 노출.

### Fixed

- **`SERVER_VERSION` stale 해소** ([src/server.ts](./src/server.ts)) — 이전엔 `"0.0.1"` 하드코딩 → MCP 클라이언트 server info, stdio 서버 startup 로그가 모두 잘못된 버전 표시. 이제 `package.json` 을 런타임에 읽어 자동 동기화 (npm publish 마다 별도 작업 불필요).

### Changed

- **setup 완료 메시지 단순화** ([src/scripts/setup.ts](./src/scripts/setup.ts)) — 모드별 (로컬/원격) 안내 분기 제거. 대신 `vX.Y.Z 버전으로 설치가 완료되었습니다.` + 재시작 안내 두 줄로. 버전은 `package.json` 동적 로드.

### Internal

- `tests/smoke.test.ts` — server version assertion 도 `package.json` 동적 로드로 변경 (이전엔 `"0.0.1"` 하드코딩).

---

## [0.8.2] - 2026-05-10

> **setup wizard 입력 검증 강화 + 문구 다듬기**: 미감지 클라이언트 선택을 거부해 의미 없는 빈 config 파일 생성을 차단. 배너·운영 모드·완료 메시지 문구를 사용자 관점에서 간결화.

### Fixed

- **감지되지 않은 클라이언트 선택 거부** ([src/scripts/setup.ts](./src/scripts/setup.ts)) — 이전엔 범위 (1~5) 만 검증해서 미감지 클라이언트도 선택 가능 → 사용자 PC 에 의미 없는 빈 config 파일 생성됨. 이제 `detectedFlags` 로 차단, 어느 번호가 미감지인지 명시 + `0` (수동 안내) escape hatch 안내. 클라이언트가 실제 설치되고 한 번이라도 실행되어 config 디렉터리/파일이 만들어진 후에 setup 권장.

### Changed

- **setup wizard 문구 다듬기**:
  - 배너 부제: "법제처 31 + PIPC 인덱스 2 + RAG 3 + 검증 1 = 37개 도구" → "법제처 자료와 개인정보포털 자료의 연계 활용" (도구 개수 나열 대신 차별화 메시지)
  - Step 1 "IP/도메인 등록은 비워두는 것을 권장" 안내 줄 제거
  - Step 2 원격 모드 설명: "즉시 37개 도구 사용 (best-effort, cold start 가능)" → "원격지에서 실행 - 약간 느림"
  - 완료 메시지: "RAG 코퍼스 (2,432 청크) 가 패키지에 번들되어 별도 다운로드 불필요" 줄 제거 (사용자 입장에서 implementation detail)

---

## [0.8.1] - 2026-05-10

> **HF 코퍼스 v1.2 동기화 + 설치/제거 마법사 도입 + 설치 안내 정비**: 분야별 개인정보 보호 안내서가 8개 편 전체 청킹 완료되어 RAG 코퍼스가 2,202 → 2,432 청크로 확장. `npx korean-privacy-law-mcp setup` 한 줄로 API 키 입력 → 운영 모드 → MCP 클라이언트 설정 자동 등록까지 마치는 인터랙티브 마법사 신설. 짝궁으로 `uninstall` 도 함께.

### Added

- **`setup` 서브커맨드 신설** ([src/scripts/setup.ts](./src/scripts/setup.ts)) — 사용 예: `npx korean-privacy-law-mcp setup`. alio 의 setup wizard 패턴을 차용하되 ALIO 데이터 fetch 단계 제거 (RAG 코퍼스가 npm 패키지에 번들).

  3단계 흐름:
  1. **API 키 (필수)** — 법제처 OPEN API 인증키 입력. 빈 값이면 빨간 경고 + 재요청 (Ctrl+C 로만 종료)
  2. **운영 모드** — 로컬 stdio (권장, 빌드 자동 감지) / 원격 HF Space 중 선택. `[기본=1]` 디폴트, 1·2 외 입력 거부
  3. **클라이언트 다중 선택** — Claude Desktop / Cursor / Windsurf / VS Code / Claude Code 중 다중 선택. 감지된 항목 자동 디폴트 (`[기본=감지된 1,3]`), `^\d+$` + range check 로 잘못된 토큰 거부 (어느 토큰이 invalid 인지 표시). `0` 입력 시 manual JSON 출력 (escape hatch)

  안전장치: Claude Desktop 은 streamable-HTTP 직접 등록 시 [anthropics/claude-ai-mcp#211](https://github.com/anthropics/claude-ai-mcp/issues/211) 버그 회피용 `mcp-remote` 브릿지 자동 적용. 다른 클라이언트는 `url` 직접 등록.

- **`uninstall` 서브커맨드 신설** ([src/scripts/uninstall.ts](./src/scripts/uninstall.ts)) — 사용 예: `npx korean-privacy-law-mcp uninstall`.

  동작:
  1. **검사** — 모든 MCP 클라이언트 설정 파일에서 `korean-privacy-law` 항목 발견 여부 + 우리 패키지가 들어있는 모든 npx 캐시 (`~/.npm/_npx/*/`) + 회수 가능 사이즈 표시
  2. **확인 prompt** — 기본 `[y/N]`, 실수 방지로 No 가 default
  3. **제거 실행** — 클라이언트 설정에서 `korean-privacy-law` 키만 삭제 (다른 MCP 서버는 보존), npx 캐시 디렉터리 통째 삭제 (단, 자기 자신이 실행 중인 캐시는 OS 가 사용 중이라 제외 → 안내 출력)
  4. **수동 정리 안내** — 현재 캐시 / 글로벌 설치 / `LAW_OC` 환경변수
- **`src/index.ts` 서브커맨드 라우팅 추가** — `args[0] === "setup"` / `"uninstall"` 분기. 기본 동작 (stdio 서버) 은 그대로.

### Changed

- **HF 코퍼스 v1.2 동기화** ([897ac92](https://github.com/scvcoder/korean-privacy-law-mcp/commit/897ac92)) — `scvcoder/korean-privacy-law-corpus` v1.2 반영. 분야별 안내서 246 → **476 청크** (+230, 통계작성 54·공공기관 48·온라인 경품행사 16 신규). 총 코퍼스 2,202 → **2,432 청크**. 코드 description (`search_privacy_corpus`·`search_privacy_guides`·`corpus-index.ts`)·문서 (`CLAUDE.md`·`README.md` 배지·`docs/API.md`·`huggingface/README.md`)·테스트 assertion 모두 동기화.
- **`data/hf_dataset/CHANGELOG.md` 신설** — 데이터셋 자체의 버전 이력 (v1.0 → v1.2) 별도 관리. 본 코드 CHANGELOG 와 분리.
- **README 설치 안내 통합** ([516339e](https://github.com/scvcoder/korean-privacy-law-mcp/commit/516339e)) — Claude.ai 웹 / Claude Desktop / Cursor / Windsurf 가 모두 동일한 원격 커넥터 흐름이라 방법 1·2 분리 → 단일 섹션으로 통합.
- **Claude Desktop 안내 별도 섹션 신설** ([718c1c2](https://github.com/scvcoder/korean-privacy-law-mcp/commit/718c1c2)) — Claude Desktop 은 원격 MCP 직접 연결을 미지원하므로 `mcp-remote` 브릿지가 필요. 방법 1 본문에서 빼고 별도 섹션으로 분리해 사용자 혼동 방지.
- **README 정리** ([7234f22](https://github.com/scvcoder/korean-privacy-law-mcp/commit/7234f22)) — 메인 사용 흐름에 집중. `docs/CLAUDE_DESKTOP.md` 는 GitHub 노출 제외 (.gitignore).

### Internal

- **`huggingface/` 폴더 GitHub 비노출** ([e1feb3b](https://github.com/scvcoder/korean-privacy-law-mcp/commit/e1feb3b)) — HF Space 배포용 README 템플릿이라 GitHub repo 에는 불필요. `.gitignore` 추가.

---

## [0.8.0] - 2026-05-06

> **최초 공개 release**: PIPA 도메인 깊이를 차별화 축으로 하는 한국 개인정보보호법 전문 MCP — 법제처 OPEN API 31개 wrapper + PIPC 공식 출처 인덱스 2개 + RAG 코퍼스 3개 + 4계층 환각 검증 1개, 총 **37개 도구**.

### Added

- **Layer A — Primitives 31개** (법제처 OPEN API wrapper). 법령 검색·본문·관계·구조·시간축·비교·행정규칙·결정문 (PIPC·헌재·행심)·해석례·영문·용어·약칭. 짧은 법령명 `display=100` 강제, 영문 법령 XML 강제, PIPC 결정문 `<Ppc>` case-sensitive, 행정심판례 `PrecService` root, `lsAbrv` 24h 캐시 등 API quirk 모두 처리.
- **Layer B+ — PIPC 공식 출처 인덱스 2개**:
  - `get_sectoral_related_laws(sector?)` — 「분야별 개인정보 보호 안내서」 (PIPC, 2024.12) 8개 분야 (인사·노무·사회복지시설·의료기관·약국·학원·교습소·통계작성·공공기관·온라인 경품) 정형 표 lookup. `official_laws` (PIPC 공식, 권위) vs `additional_mentions` (본문 빈도, 참고) 분리. 별칭 자동 정규화.
  - `get_pipc_curated_corpus(category?)` — 개인정보 포털 (privacy.go.kr/contsNo=116·117) 12 법령 + 23 행정규칙. PIPC 가 portal 에 직접 게시한 list 그대로.
- **Layer C — RAG 코퍼스 3개** (총 2,202 청크, Contextual Retrieval 적용):
  - `search_privacy_corpus` — 가이드 + 사례 통합 (LLM 첫 진입 도구)
  - `search_privacy_guides(doc_type?)` — PIPC 공식 가이드 4종 (질의응답 99 + 소상공인 41 + CCTV 71 + 분야별 246)
  - `search_privacy_cases` — privacy.go.kr 상담사례 1,745건 (`category1/2/3` × `year_range` 필터)
  - 부팅 시 BM25 인덱스 메모리 빌드 (한국어 토크나이저, prefix + fuzzy 0.2). 응답에 `📎 출처: 개인정보보호위원회, ...` attribution 자동 첨부 (pipc-attribution 라이선스).
- **Validator 1개** — `verify_pipa_citation(citation, as_of?)` 4계층 환각 검증 (법령 → 조 → 항 → 호·목). `parseCitation` 이 `§·①·호` 약식 자동 정규화. PRIVACY_ALIASES 17종 자동 적용. `as_of` YYYYMMDD 로 시점별 본문 조회. 환각 시 `[HALLUCINATION_DETECTED]` + 단계별 ✗.
- **응답 baseline 6종** — `[NOT_FOUND]` / `[HALLUCINATION_DETECTED]` / `[OUT_OF_SCOPE]` / `[NOT_FOUND_SCOPE]` 머신 파싱 마커, `isError: true` MCP 스펙 준수, 다음 도구 후보 자동 노출, 정규 URL 첨부, OC 키 마스킹, 편향 차단 (Layer B+ 전용).
- **HTTP Streamable 진입점** ([src/http.ts](./src/http.ts)) — `/mcp` 엔드포인트, stateless 모드, URL 쿼리 (`?oc=`) / 헤더 (`apikey`·`x-law-oc`) 키 전달.
- **HF Space 배포** — `https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY` 즉시 사용 가능.
- **npx 실행** — `npx korean-privacy-law-mcp` 로컬 stdio 모드.
- **441 테스트** (`npm test` — 법제처 API 실호출 + 스냅샷, mock 위주 X).

### Background

- **차별화 축**: 일반 법령 MCP 가 못 다루는 개인정보 도메인 깊이 — 특별법 우선 원칙 (lex specialis), 시점 분기 (정보통신망법 → PIPA 흡수), 4계층 위임 (법·시행령·시행규칙·PIPC 고시), PIPC 의결례 구조화, PIPC 공식 RAG 코퍼스, 4계층 환각 검증.
- **메타 철학**: LLM-driven discovery — 깔끔한 primitive 와 derive 불가능한 메타지식 (PIPC 공식 출처 인덱스, RAG 코퍼스, 환각 검증) 만 제공. `discover_tools`/`execute_tool` 같은 게이트 없음. LLM 이 도구 description 으로 직접 라우팅.
- **타깃**: 개인정보 보호 실무자 (CPO · 법무 · 컴플라이언스).
