# Changelog

본 데이터셋(`scvcoder/korean-privacy-law-corpus`)의 모든 주요 변경사항은 이 파일에 기록됩니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/), 버전은 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)을 따릅니다.

---

## [v1.2] — 2026-05-10

### Added
- **분야별 개인정보 보호 안내서(2024.12) 8개 편 전체 청킹 완료** — 246청크 → **476청크** (+230청크).
  - VI-통계작성 편 54청크 (chunk_358~411) — Ⅰ.개요·Ⅱ.기본원칙·Ⅲ.업무 단계별 처리(기획·수집·처리·보유·제공) + FAQ 7건.
  - VII-공공기관 편 48청크 (chunk_412~459) — Ⅰ.개요·Ⅱ.보호 원칙·Ⅲ.업무유형별(감사·공직선거·수사·행정조사) + FAQ·결정례·판례.
  - VIII-온라인 경품행사 편 16청크 (chunk_460~475) — Ⅰ.개요·Ⅱ.보호원칙·Ⅲ.단계별(기획·공지·발표·발송·종료) + FAQ + 점검표.

### Changed
- 총 레코드 수: 2,202 → **2,432**.
- 분야별 안내서 메타: "의료기관 편까지 청킹 완료(부분 공개)" → "8개 편 전체 청킹 완료".

### Notes
- VIII 편 참고 2 「개인정보 보호법」 §15·§16·§18·§21·§24의2·§26 조문 verbatim 인용은 **청킹 제외** — 일반 보호법 조문이라 다른 RAG 데이터(법제처 직접 호출)에서 처리.
- 모든 신규 청크는 [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) 기법 적용 — `chunk_context` 필드 포함.
- gap·dup 없이 chunk_no 0~475 연속 보장.

---

## [v1.1] — 2026-05-06

### Added
- **분야별 개인정보 보호 안내서(2024.12) 의료기관 편까지 부분 공개** — 246청크 (인사·노무 32 + 사회복지시설 72 + 의료기관 142). 약국·학원·통계·공공·온라인 경품 5개 편은 v1.2에서 공개 예정.

### Changed
- 기존 가이드 3종(질의응답·핸드북·CCTV)에도 `chunk_context` 보완.
- 상담사례 `source_url` 현행화 (camelCase 포맷 `?nttId=...&nttNo=...`).
- 가이드 `source_url` 현행화 — PIPC 자료실 게시판 직링크 부여 (`bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo={ID}`).

---

## [v1.0] — 2026-05-02

### Added
- 최초 공개 — 가이드 3종 211청크 + 상담사례 1,745건 (총 1,956청크).
  - 소상공인을 위한 개인정보 보호 핸드북(2024.12) 41청크.
  - 개인정보 질의응답 모음집(2025.12) 99청크.
  - 고정형 영상정보처리기기 설치 운영 안내서(2024.12) 71청크.
  - privacy.go.kr 상담사례 1,745건.
- 표준화 스키마 적용 — 공통 10필드 (`chunk_id`/`source_type`/`doc_id`/`doc_title`/`doc_date`/`section`/`body`/`chunk_context`/`source_pdf`/`source_url`).
- Anthropic Contextual Retrieval 기법 전체 청크에 적용.
- 라이선스: PIPC Attribution (가이드 원문 저작권 표시 그대로 인용 — 무단전재 금지, 가공·인용 시 출처표시).
