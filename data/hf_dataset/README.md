---
language:
- ko
license: other
license_name: pipc-attribution
license_link: LICENSE.md
pretty_name: Korean Privacy Law RAG Corpus
size_categories:
- 1K<n<10K
task_categories:
- question-answering
- text-retrieval
- text-generation
tags:
- legal
- privacy
- korean
- rag
- retrieval-augmented-generation
- contextual-retrieval
- pipa
- pipc
- privacy-law
configs:
- config_name: default
  data_files:
  - split: train
    path: "*.jsonl"
---

# 한국 개인정보보호법 관련 RAG 구축을 위한 코퍼스

개인정보 포털(privacy.go.kr)의 각종 개인정보보호법 관련 가이드와 상담사례 1,745건을
RAG(Retrieval-Augmented Generation)에 바로 쓸 수 있도록 **의미 단위 청킹·문맥 보강**한
코퍼스입니다. 모든 청크에는 [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
기법을 적용한 `chunk_context` 필드가 포함되어 있어, 임베딩 검색 정확도를 즉시 끌어올릴
수 있습니다.

테스트링크: https://scvcoder-kpaa.hf.space/

### 구성

- 개인정보_질의응답_모음집(2025.12.).pdf
- 소상공인을_위한_개인정보 보호_핸드북(2024.12).pdf
- 고정형 영상정보처리기기_설치_운영_안내서(2024.12).pdf
- 분야별 개인정보 보호 안내서(2024.12).pdf — 의료기관 편까지 청킹 완료(부분 공개), 약국·학원·통계·공공·온라인 경품 편 추가 예정
- 개인정보포털 홈페이지 상담사례 1745건

**English** — A Korean RAG corpus on personal information protection law (PIPA),
built from official guides and 1,745 consultation cases published on the
Personal Information Portal (privacy.go.kr). Each chunk is semantically
segmented and enriched with a `chunk_context` field following the Contextual
Retrieval technique — ready to drop into a RAG pipeline and improve
embedding-search accuracy out of the box.

---

## 1. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v1.0 | 2026-05-02 | 최초 공개 — 가이드 3종 211청크 + 상담사례 1,745건, 표준화 스키마 적용 |
| v1.1 | 2026-05-06 | 1. 분야별 개인정보 보호 안내서(2024.12) 의료기관 편까지 청킹 246청크 부분 공개 (인사·노무 32 + 사회복지시설 72 + 의료기관 142). 약국·학원·통계·공공·온라인 경품 5개 편은 추가 작업 후 v1.2에서 공개 예정.<br>2. 기존 가이드 3종(질의응답·핸드북·CCTV)도 `chunk_context` 보완<br>3. 상담사례 `source_url` 현행화<br>4. 가이드 `source_url` 현행화 (PIPC 자료실 게시판 직링크 부여) |

---

## 2. 데이터셋 개요

| 항목 | 값 |
|---|---|
| 총 레코드 수 | **2,202** 청크 |
| 언어 | 한국어 |
| 도메인 | 개인정보보호법(PIPA) · 개인정보보호 실무 |
| 형식 | JSON Lines (`.jsonl`) |
| 인코딩 | UTF-8 |
| 출처 | 개인정보보호위원회 (자세한 내용은 §8 참조) |
| 적용 기법 | Semantic Chunking, Contextual Retrieval |

### 구성 (`source_type`으로 필터링)

| 파일 | `source_type` | 청크 수 | 출처 | 발행/수집 시점 |
|---|---|---:|---|---|
| 개인정보_질의응답_모음집(2025.12.).jsonl | `guide` | 99 | PIPC 공식 가이드 PDF | 2025.12 |
| 소상공인을_위한_개인정보 보호_핸드북(2024.12).jsonl | `guide` | 41 | PIPC 공식 가이드 PDF | 2024.12 |
| 고정형 영상정보처리기기_설치_운영_안내서(2024.12).jsonl | `guide` | 71 | PIPC 공식 가이드 PDF | 2024.12 |
| 분야별_개인정보_보호_안내서(2024.12).jsonl | `guide` | 246 *(진행 중)* | PIPC 공식 가이드 PDF — 8개 편 중 인사·노무, 사회복지시설, 의료기관 편 완료 | 2024.12 |
| 개인정보포털_상담사례.jsonl | `case` | 1,745 | privacy.go.kr 상담사례 | 2012~ 누적 |

---

## 3. 스키마

모든 레코드는 다음 **공통 필드**(앞 10개)를 갖고, 그 뒤에 출처별 필드가 이어집니다.
출처별 원본 필드는 모두 보존했습니다.

### 공통 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `chunk_id` | string | 청크 고유 ID (예: `질의응답_모음집_0000`, `상담사례_0001`) |
| `source_type` | string | `"guide"` 또는 `"case"` |
| `doc_id` | string | 원문 문서 식별자 |
| `doc_title` | string | 원문 제목 |
| `doc_date` | string | 발행일 (`YYYY.MM` 또는 `YYYY.MM.DD`) |
| `section` | string | 장·절·카테고리 (가이드: 목차, 사례: `대분류 > 중분류 > 소분류`) |
| `body` | string | **임베딩 대상 본문** |
| `chunk_context` | string | Contextual Retrieval — 본문이 속한 맥락·인접 조항·법 근거 요약 |
| `source_pdf` | string | 가이드의 원본 PDF 파일명 (사례는 빈 문자열) |
| `source_url` | string | 원본 게시물 URL (가이드: PIPC 자료실 게시판 직링크 `bbsView.do?bbsNo=…&bbscttNo=…`, 사례: privacy.go.kr 사례 상세 페이지) |

### 가이드(`source_type="guide"`) 추가 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `chunk_no` | int | 문서 내 청크 일련번호 |
| `pages` | string | 책의 페이지 번호 (예: `"p.3"`) |

### 상담사례(`source_type="case"`) 추가 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `ntt_id`, `ntt_no` | string | privacy.go.kr 게시물 ID |
| `title` | string | 사례 제목(질문) |
| `summary` | string | 사례 요약 |
| `type_code`, `type_label` | string | 사례 유형 (`COU` = 상담 사례집 등) |
| `category1`, `category2`, `category3` | string | 분류 체계 |
| `reg_dt` | string | 등록일 (`YYYYMMDD`) |
| `case_year` | string | 사례 연도 |
| `source_note` | string | 출처 주석 |
| `detail_url` | string | privacy.go.kr 상세 경로 |

---

## 4. 샘플 레코드

### 가이드 청크 예시

```json
{
  "chunk_id": "질의응답_모음집_0000",
  "source_type": "guide",
  "doc_id": "질의응답_모음집",
  "doc_title": "개인정보 질의응답 모음집",
  "doc_date": "2025.12",
  "section": "I.정의 [Q&A] Q1 ID와 결제상품정보가 개인정보에 해당",
  "body": "Q1 ID와 결제상품정보가 개인정보에 해당하나요? …",
  "chunk_context": "이 청크는 「개인정보 질의응답 모음집(2025.12)」 Ⅰ.정의 영역 첫 사례(Q1, 책 p.3)로, …",
  "source_pdf": "1. 개인정보 질의응답 모음집(2025.12.).pdf",
  "source_url": "https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20861",
  "chunk_no": 0,
  "pages": "p.3"
}
```

### 상담사례 청크 예시

```json
{
  "chunk_id": "상담사례_0001",
  "source_type": "case",
  "doc_id": "개인정보포털_상담사례",
  "doc_title": "개인정보포털 상담사례",
  "doc_date": "2012.01.20",
  "section": "개인정보처리자(민간) > 개인정보 수집·이용 > 보건·의료",
  "body": "Q) 의료기관에 환자가 처음으로 내원한 경우에 …",
  "chunk_context": "이 청크는 「개인정보 상담사례 #1(2012, privacy.go.kr)」 보건·의료 업종 …",
  "source_pdf": "",
  "source_url": "https://www.privacy.go.kr/front/case/view.do?nttNo=1&nttId=1",
  "ntt_id": "1",
  "title": "병원에서 초진 환자의 개인정보 수집시 동의 취득 여부",
  "category1": "개인정보처리자(민간)",
  "category2": "개인정보 수집·이용",
  "category3": "보건·의료",
  "reg_dt": "20120120",
  "case_year": "2012"
}
```

---

## 5. 사용 예시

### 🤗 Datasets 로드

```python
from datasets import load_dataset

ds = load_dataset("scvcoder/korean-privacy-law-corpus", split="train")

guides = ds.filter(lambda x: x["source_type"] == "guide")  # 457
cases  = ds.filter(lambda x: x["source_type"] == "case")   # 1,745
```

### 임베딩 시 권장: `chunk_context` + `body` 결합

Contextual Retrieval 방식에 따라 임베딩 입력은 두 필드를 합쳐 사용하는 것을 권장합니다.

```python
def to_embedding_text(rec: dict) -> str:
    return f"{rec['chunk_context']}\n\n{rec['body']}"
```

### BM25 / 하이브리드 검색

`body`만 BM25 색인에 넣어도 무방하나, `chunk_context`까지 함께 색인하면 짧은 질의에서 회수율이
크게 향상됩니다(특히 법조항 단편 검색).

---

## 6. 데이터 수집·가공 방법

1. **원천 수집**
   - 가이드 PDF 3종: PIPC 발행 공식 가이드 다운로드
   - 상담사례: privacy.go.kr 상담사례 게시판 1,745건 수집
2. **PDF → 청크 변환**
   - 사람이 검토하는 인터랙티브 청킹 파이프라인. 책의 페이지·절 단위를 우선시하되,
     의미가 끊기는 곳에서 청크 경계를 두었습니다 (1청크 ≈ 200~600 한국어 어절).
3. **Contextual Retrieval 적용**
   - 각 청크에 대해 인접 조항·법조 근거·도식 의미를 자연어로 요약한 `chunk_context`를 LLM으로 생성하고,
     문서 작성자가 검수.
4. **표준화**
   - 본 코퍼스 단위로 공통 필드 10개를 모든 레코드에 도입(원본 필드 유지).

---

## 7. 활용 케이스

- **Korean privacy assistant ai 챗봇** — 소상공인·작은병원·학교 등 비전문가용 상담 RAG.
- **법률 LLM 파인튜닝의 retrieval 평가셋** — `title`/`body`를 질의·정답 쌍으로 변환 가능.
- **한국어 법률·규제 도메인 retrieval 벤치마크** — 도메인 시프트(일반 ↔ 법률) 평가.

---

## 8. 출처표시

본 데이터셋의 출처는 개인정보보호위원회의 가이드와 개인정보 포털(privacy.go.kr)의
상담자료임을 밝힙니다. 본 데이터셋을 사용·인용·재배포할 때는 반드시 다음 출처를
명시해 주십시오.

### 원자료 출처

1. 개인정보보호위원회, 「개인정보 질의응답 모음집」 2025.12.
2. 개인정보보호위원회, 「소상공인을 위한 개인정보 보호 핸드북」 2024.12.
3. 개인정보보호위원회, 「고정형 영상정보처리기기 설치·운영 안내서(공공 및 민간분야 통합본)」 2024.12.
4. 개인정보보호위원회·보건복지부 등, 「분야별 개인정보 보호 안내서」 2024.12.
5. 개인정보 포털 상담사례 : https://www.privacy.go.kr/front/case/list.do

### 가공

Semantic Chunking 및 Contextual Retrieval 기법으로 작성한 맥락 요약, 표준화 스키마는
본 데이터셋 기여자의 2차 저작물이며, 위와 동일 조건으로 이용 가능합니다.

원저작자가 전부 또는 일부의 삭제 또는 수정 요청을 할 경우 즉시 조치하겠습니다.

1. Korean Privacy Law RAG Corpus (https://huggingface.co/datasets/scvcoder/korean-privacy-law-corpus)
2. 가공내용 : Semantic Chunking, Contextual Retrieval 추가 등

---

## 9. 한계 및 주의사항

- **법률 자문이 아닙니다.** 본 데이터는 교육·연구·도구 개발용이며, 구체적 사안에 대한 법적 판단은
  전문가의 자문을 받아야 합니다.
- **시점 기준** — 가이드는 발행일(2024.12 / 2025.12) 기준이며, 이후 법 개정이 있을 수 있습니다.
  변경사항은 현행 법령을 확인하세요.
- **상담사례** — privacy.go.kr 상담사례는 PIPC가 개별 사안에 회신한 답변으로,
  유사한 사안에서도 사실관계가 다르면 결론이 달라질 수 있습니다.

---

*Compiled and curated by [scvcoder](https://huggingface.co/scvcoder).*
