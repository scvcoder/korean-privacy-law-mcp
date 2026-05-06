---
title: Korean Privacy Law MCP
emoji: 🔒
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: 한국 개인정보보호법(PIPA) MCP / Korean Privacy Law MCP
tags:
  - mcp
  - mcp-server
  - korean-law
  - privacy
  - pipa
  - pipc
  - legal-ai
license: mit
---

# Korean Privacy Law MCP

대한민국 **개인정보보호법(PIPA)** 을 자연어로 검색·비교·분석·검증하는 **원격 MCP 서버**.

법제처 31 + PIPC 공식 출처 인덱스 2 + RAG 코퍼스 3 + 환각 검증 1 — 총 **37개 MCP 도구** 가 PIPA·시행령·PIPC 고시·의결례 + PIPC 공식 가이드 4종·상담사례 1,745건 (총 2,202 청크) 을 한 번에 다룹니다.

## 사용법

이 Space 는 **MCP Streamable HTTP** 엔드포인트를 노출합니다 — Claude.ai 웹 / Claude Desktop / Cursor / Windsurf 에서 원격 커넥터로 연결하면 즉시 37개 도구가 활성화됩니다.

### 0단계: 법제처 OPEN API 인증키 발급 (무료, 1분)

1. [법제처 OPEN API 신청](https://open.law.go.kr/LSO/openApi/guideResult.do) 회원가입·로그인
2. "OPEN API 사용 신청" → **인증키(OC)** 발급 (이메일 ID 형식)

### 방법 1 — Claude.ai 웹 (가장 간편)

claude.ai 사이드바 → 설정 → 커넥터 → **커스텀 커넥터 추가**:

- 이름: `korean-privacy-law` (자유)
- URL: `https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY`

저장 후 도구 목록에서 모든 도구를 "항상 사용" 으로 설정.

### 방법 2 — Claude Desktop · Cursor · Windsurf

설정 파일 (`claude_desktop_config.json` 등) 에 추가:

```json
{
  "mcpServers": {
    "korean-privacy-law": {
      "url": "https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY"
    }
  }
}
```

### API 키 전달 방법

위에서부터 우선 적용:

| 방법 | 형식 |
|---|---|
| URL 쿼리 | `?oc=YOUR_KEY` |
| HTTP 헤더 | `apikey: YOUR_KEY` 또는 `x-law-oc: YOUR_KEY` |

키가 누락되면 HTTP 401 + 안내 메시지가 반환됩니다.

## 동작 확인

- `GET /` — 서버 메타데이터 (도구 개수·버전·키 전달 방법)
- `POST /mcp` — MCP Streamable HTTP 엔드포인트 (stateless, 요청마다 fresh Server)

```bash
# 서버 정보
curl https://scvcoder-korean-privacy-law-mcp.hf.space/

# MCP initialize 호출
curl -X POST 'https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","clientInfo":{"name":"curl","version":"0"},"capabilities":{}}}'
```

## 자세한 정보

소스 · 문서 · 도구 레퍼런스: <https://github.com/scvcoder/korean-privacy-law-mcp>

## 면책

본 MCP 는 **법률 자문이 아닙니다**. 개인정보 도메인 자료 검색·비교·분석을 도와주는 도구이며, 구체적 사안의 법적 판단은 전문기관이나 전문가 자문을 받으십시오.

RAG 코퍼스 원자료 출처: 개인정보보호위원회 가이드 및 [개인정보 포털 상담사례](https://www.privacy.go.kr/front/case/list.do). 원자료 저작자가 전부 또는 일부의 삭제·수정 요청을 할 경우 즉시 조치하겠습니다.
