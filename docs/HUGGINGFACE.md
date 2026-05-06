# Hugging Face Spaces 배포 가이드

이 프로젝트를 `scvcoder/korean-privacy-law-mcp` Hugging Face Space 로 배포하는 단계별 안내. Pro 구독이면 즉시 가능합니다.

배포 후 URL: `https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY`

---

## 사전 준비

| 항목 | 비고 |
|---|---|
| Hugging Face 계정 | `scvcoder` (Pro 구독 — Space 비공개·시크릿·하드웨어 옵션 가능) |
| 법제처 OPEN API 인증키 | [발급 페이지](https://open.law.go.kr/LSO/openApi/guideResult.do) 무료, 1분 |
| Git + huggingface_hub CLI | `pip install -U "huggingface_hub[cli]"` (선택, 토큰 인증 편리) |

---

## 1단계: HF Space 생성

[huggingface.co/new-space](https://huggingface.co/new-space) 접속 후:

| 필드 | 입력값 |
|---|---|
| Owner | `scvcoder` |
| Space name | `korean-privacy-law-mcp` |
| License | `MIT` |
| Select the Space SDK | **Docker** → "Blank" 선택 |
| Space hardware | `CPU basic — 2 vCPU · 16 GB` (무료, 충분) |
| Public/Private | Public (커뮤니티 공개) 또는 Private (Pro 한정) |

"Create Space" 클릭. 빈 Space repo 가 생성됩니다.

---

## 2단계: HF 전용 README 준비

Space repo 의 루트 README.md 는 YAML frontmatter 가 필요합니다 (HF 가 이걸로 Space 메타데이터 인식).

본 프로젝트의 [`huggingface/README.md`](../huggingface/README.md) 가 그 템플릿입니다 — 그대로 복사해서 Space repo 의 `README.md` 로 사용.

---

## 3단계: HF Space repo 에 코드 푸시

### 옵션 A — 별도 클론 후 푸시 (가장 안전)

GitHub repo 와 HF Space repo 를 분리해서 관리하는 방식. 충돌 가능성 0.

```bash
# 1. HF Space repo 클론
git clone https://huggingface.co/spaces/scvcoder/korean-privacy-law-mcp hf-space
cd hf-space

# 2. 본 프로젝트 파일 복사 (테스트·개발 파일 제외)
PROJECT=/path/to/korean-privacy-law-mcp
cp -r $PROJECT/src ./
cp -r $PROJECT/data ./
cp $PROJECT/Dockerfile $PROJECT/.dockerignore $PROJECT/package.json $PROJECT/package-lock.json $PROJECT/tsconfig.json ./

# 3. HF 전용 README 사용
cp $PROJECT/huggingface/README.md ./README.md

# 4. 푸시
git add .
git commit -m "Initial deploy"
git push
```

> Push 시 Hugging Face 토큰이 필요. [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) 에서 "write" 권한 토큰 발급 후 비밀번호 자리에 붙여넣기. 또는 `huggingface-cli login` 으로 한번에 등록.

### 옵션 B — GitHub repo 에 HF remote 추가 (단일 소스)

GitHub 와 HF Space 가 같은 코드 — 한 번 푸시하면 양쪽 모두 갱신.

```bash
cd /path/to/korean-privacy-law-mcp

# HF Space remote 추가
git remote add space https://huggingface.co/spaces/scvcoder/korean-privacy-law-mcp

# HF 전용 README 적용 (현재 main README 는 GitHub 용)
# → HF push 직전에만 README 교체하는 스크립트 필요
cp huggingface/README.md README.md   # 임시 교체
git add README.md
git commit -m "HF: switch README to space variant"
git push space main

# 다시 GitHub 용으로 되돌림
git checkout HEAD~1 README.md
git commit --amend --no-edit
```

번거로워서 옵션 A 권장.

---

## 4단계 (선택): 서버 기본 LAW_OC 시크릿 등록

기본 모드는 **사용자가 매 요청에 자기 키를 가져오는** 방식 (`?oc=YOUR_KEY`). API 한도가 사용자 본인 OC 에서 차감되어 운영자 부담 0.

만약 운영자가 LAW_OC 를 *기본 키로* 제공해서 사용자가 키 없이도 쓸 수 있게 하려면:

1. Space 페이지 → **Settings** 탭 → **Variables and secrets**
2. **New secret** 클릭:
   - Name: `LAW_OC`
   - Value: 본인 발급 키 (이메일 ID)
3. Save

이후 `https://...hf.space/mcp` 에 키 없이 접속해도 동작 (서버의 LAW_OC 가 fallback). 단 모든 사용자의 호출이 운영자의 OC 로 집계됩니다.

> 권장: **시크릿 미설정** (기본). 사용자가 본인 키 가져오는 방식 — 알리오 MCP 와 동일 패턴.

---

## 5단계: Docker 빌드 대기

push 완료 후 Space 페이지의 **"Building"** 상태가 **"Running"** 으로 바뀔 때까지 약 3-5분 소요.

진행 상황은 Space 페이지의 **"Logs"** 탭 → "Build logs" 에서 확인. 우리 Dockerfile 은 multi-stage 라:

```
[builder] npm ci
[builder] npm run build  (tsc 컴파일)
[runtime] npm ci --omit=dev
[runtime] CMD node dist/http.js
```

순으로 진행되며, 마지막에:

```
[korean-privacy-law-mcp v0.0.1] HTTP MCP 서버 시작 — 0.0.0.0:7860/mcp (도구 37개)
```

가 로그에 보이면 정상.

---

## 6단계: 동작 확인

```bash
# 서버 메타데이터 (키 불필요)
curl https://scvcoder-korean-privacy-law-mcp.hf.space/

# 응답 예시:
# {"name":"korean-privacy-law-mcp","version":"0.0.1","transport":"streamable-http",
#  "endpoint":"/mcp","tools":37, ...}
```

```bash
# MCP initialize (키 필수)
curl -X POST 'https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-03-26",
                 "clientInfo":{"name":"curl","version":"0"},
                 "capabilities":{}}}'

# 응답: SSE 형식으로 protocolVersion + tools capability + 도구 37개
```

```bash
# 도구 목록
curl -X POST 'https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

---

## 7단계: AI 클라이언트에서 연결

### Claude.ai 웹

1. claude.ai 로그인
2. 사이드바 하단 본인 이름 → **설정** → **커넥터**
3. **커스텀 커넥터** → **커스텀 커넥터 추가**
4. 입력:
   - 이름: `korean-privacy-law` (자유)
   - URL: `https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY`
5. 저장 → 도구 목록에서 모든 도구를 **"항상 사용"** 으로 설정

채팅에서 자연어로:
```
"의료기관에서 환자 개인정보 처리할 때 어떤 법이 우선이야?"
"개인정보 보호법 §28-2 가 2020년 6월에 유효했어?"
"가족 동의 없이 자녀 사진을 SNS 에 올려도 돼?"
```

### Claude Desktop · Cursor · Windsurf

설정 파일에 추가:

```json
{
  "mcpServers": {
    "korean-privacy-law": {
      "url": "https://scvcoder-korean-privacy-law-mcp.hf.space/mcp?oc=YOUR_KEY"
    }
  }
}
```

저장 후 앱 재시작.

---

## 트러블슈팅

### Build logs 에 `tsc: not found` 등 에러

`devDependencies` 에 `typescript` · `@types/node` · `@types/express` 가 모두 있어야 합니다. `package.json` 확인.

### Build 성공인데 Container logs 에 `Cannot find module 'express'`

`dependencies` (devDependencies 아님) 에 `express` 가 있는지 확인. Multi-stage Dockerfile 의 runtime 단계에서 `npm ci --omit=dev` 가 devDependencies 만 제거하므로, runtime 에서 필요한 건 모두 dependencies 에 있어야 합니다.

### `curl /mcp` 가 401 반환

키 누락. `?oc=YOUR_KEY` 또는 `apikey: YOUR_KEY` 헤더 추가. 에러 메시지에 발급 URL 안내.

### `curl /mcp` 가 `Not Acceptable: Client must accept both application/json and text/event-stream` 반환

MCP Streamable HTTP 스펙 — 클라이언트가 `Accept: application/json, text/event-stream` 헤더를 함께 보내야 합니다. Claude.ai · Claude Desktop 같은 정식 MCP 클라이언트는 자동 처리.

### Space 가 `Running` 인데 응답이 느림

HF Spaces CPU basic 은 idle 시 sleep 모드로 들어갑니다 — 첫 요청 시 cold start (10-30초). Pro 구독이면 **"Settings" → "Sleep time" 을 "Never sleep"** 으로 변경 가능 (단 비용 증가).

### Space 가 `Stopped` 또는 빌드 실패 반복

Settings → "Factory rebuild" 한 번 시도. 캐시 꼬였을 가능성. 그래도 안 되면 Space 삭제 후 1단계부터 재진행.

---

## 비용·성능 참고

| 항목 | 사용량 |
|---|---|
| 빌드 시간 | 3-5분 (multi-stage Docker) |
| 이미지 크기 | ~250 MB (alpine + Node 20 + dist + data) |
| 부팅 시간 | ~5초 (BM25 인덱스 메모리 빌드 포함) |
| 메모리 | ~150 MB idle, ~250 MB 검색 시 |
| HF CPU basic 무료 한도 | 충분 (개인 사용 기준) |

법제처 OPEN API 호출은 사용자 본인 OC 한도에서 차감되므로 운영자 비용 없음 (옵션 4 시크릿 미설정 기준).

---

## 다음 단계

- 도구 37개 상세 레퍼런스: [`docs/API.md`](./API.md)
- 로컬 stdio 사용법 (인터넷 없이): [`docs/CLAUDE_DESKTOP.md`](./CLAUDE_DESKTOP.md)
- 프로젝트 정체성·아키텍처: [`CLAUDE.md`](../CLAUDE.md)
