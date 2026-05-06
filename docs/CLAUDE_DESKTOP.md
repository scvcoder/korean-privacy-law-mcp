# Claude Desktop 설정 가이드

`korean-privacy-law-mcp` 를 Claude Desktop 에 연결해서 자연어로 PIPA·시행령·PIPC 고시·의결례·공식 가이드·상담사례를 검색·비교·분석하는 단계별 안내. Cursor / Windsurf 도 거의 동일.

---

## 사전 준비

### 1. Claude Desktop 설치

[claude.ai/download](https://claude.ai/download) 에서 OS 별 설치 파일 다운로드.

| OS | 다운로드 |
|---|---|
| macOS | `.dmg` (Apple Silicon · Intel 자동 감지) |
| Windows | `.exe` |

설치 후 한 번 실행해 로그인까지 완료해 두세요.

### 2. Node.js 18 이상

```bash
node --version    # v18.x.x 이상이어야 함
```

없거나 구버전이면 [nodejs.org](https://nodejs.org) 에서 LTS 버전 (20.x 이상 권장) 설치.

```bash
# macOS (Homebrew)
brew install node

# Windows
# nodejs.org 에서 LTS .msi 다운로드 후 설치

# Linux (Ubuntu/Debian, NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. 법제처 OPEN API 인증키 (LAW_OC) 발급

법제처 31개 도구가 사용. **무료, 1분 소요**.

1. [법제처 OPEN API 신청 페이지](https://open.law.go.kr/LSO/openApi/guideResult.do) 접속
2. 회원가입 후 로그인
3. "OPEN API 사용 신청" 버튼 클릭
4. 신청서 작성 → **인증키(OC)** 발급 (이메일 ID 형식, 예: `myaccount@example.com`)

발급 키는 메모해 두세요. 다음 단계에서 설정 파일에 입력합니다.

---

## 설정 파일 위치

| OS | 경로 |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

파일이 없으면 새로 만들면 됩니다 (Claude Desktop 을 한 번이라도 실행하면 자동 생성).

### 빠른 열기

**macOS**:

```bash
# 디렉터리 생성 (없으면)
mkdir -p ~/Library/Application\ Support/Claude

# 파일 열기 (VS Code 예시 — nano/vim/TextEdit 도 OK)
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows (PowerShell)**:

```powershell
# 디렉터리 생성 (없으면)
New-Item -ItemType Directory -Force -Path "$env:APPDATA\Claude"

# 파일 열기 (notepad 예시 — VS Code 면 `code` 로)
notepad "$env:APPDATA\Claude\claude_desktop_config.json"
```

---

## 설정 방법 — 3가지 중 선택

### 방법 A: npx 자동 실행 (가장 간편, 추천)

설정 파일에 아래 내용 그대로 입력 (`your-api-key-here` 를 본인 키로 교체):

```json
{
  "mcpServers": {
    "korean-privacy-law": {
      "command": "npx",
      "args": ["-y", "korean-privacy-law-mcp"],
      "env": {
        "LAW_OC": "your-api-key-here"
      }
    }
  }
}
```

저장 → Claude Desktop 완전 종료 → 재시작.

> **장점**: 설치 단계 없음. npm 레지스트리에서 최신 버전 자동 사용.
> **단점**: 매번 시작 시 npx 캐시 확인으로 부팅이 0.5~1초 더 걸림.

### 방법 B: 글로벌 설치 (부팅 빠름)

```bash
npm install -g korean-privacy-law-mcp

# 설치 확인
korean-privacy-law-mcp --version 2>/dev/null || which korean-privacy-law-mcp
```

설정 파일:

```json
{
  "mcpServers": {
    "korean-privacy-law": {
      "command": "korean-privacy-law-mcp",
      "env": {
        "LAW_OC": "your-api-key-here"
      }
    }
  }
}
```

> **장점**: 부팅 빠름. 오프라인 동작 (이미 받아둔 데이터로).
> **단점**: 새 버전 나오면 `npm install -g korean-privacy-law-mcp` 로 수동 업데이트.

### 방법 C: 소스 클론 (코드 수정·develop 브랜치)

```bash
git clone https://github.com/scvcoder/korean-privacy-law-mcp.git
cd korean-privacy-law-mcp
npm install
npm run build
pwd     # 절대경로 메모
```

설정 파일 (절대경로 사용):

```json
{
  "mcpServers": {
    "korean-privacy-law": {
      "command": "node",
      "args": ["/Users/yourname/workspace/korean-privacy-law-mcp/dist/index.js"],
      "env": {
        "LAW_OC": "your-api-key-here"
      }
    }
  }
}
```

또는 프로젝트 루트의 `.env` 파일에 `LAW_OC=...` 작성하면 `env` 블록 생략 가능 — 서버가 자동 로드. (Claude Desktop 이 임의 cwd 로 spawn 해도 스크립트 디렉터리 기준 `../.env` 까지 자동 탐색.)

---

## 다른 MCP 서버와 같이 쓰기

이미 다른 MCP 서버가 등록돼 있으면 **`mcpServers` 객체 안에 항목만 추가** 하면 됩니다.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname"]
    },
    "korean-privacy-law": {
      "command": "npx",
      "args": ["-y", "korean-privacy-law-mcp"],
      "env": {
        "LAW_OC": "your-api-key-here"
      }
    }
  }
}
```

JSON 문법 주의: 각 서버 항목 사이에 **콤마(`,`) 하나** 만 있어야 합니다. 마지막 항목 뒤에는 콤마 없음.

---

## 동작 확인

Claude Desktop 을 완전 종료 후 재시작 (단순 창 닫기 X — Dock/시스템 트레이에서 Quit). 채팅 입력창 좌하단의 **MCP 도구 아이콘** (망치 모양 또는 전원 아이콘) 클릭 시 `korean-privacy-law` 가 보이고 도구 37개가 나열되면 성공.

채팅으로 시험:

```
"PIPA 제15조 알려줘"
```

→ AI 가 `get_law_text` 도구를 호출하고 본문 + 정규 URL 출처를 반환하면 정상.

```
"개인정보보호법 제15조 ②항 ③호가 실제 있는 조문인지 검증해줘"
```

→ `verify_pipa_citation` 호출 → ✅ 또는 `[HALLUCINATION_DETECTED]`.

```
"의료기관에서 환자 개인정보 처리 시 우선 적용 법령"
```

→ `get_sectoral_related_laws("의료기관")` → PIPC 공식 표 + 출처·페이지·발간일 + "추가 검토 필수" 면책.

---

## 트러블슈팅

### 1. Claude Desktop 에 MCP 도구가 안 보임

원인 후보:

- **JSON 문법 오류**: 콤마 누락·여분, 중괄호 불일치, 따옴표 짝 안 맞음. [jsonlint.com](https://jsonlint.com) 에 붙여 검증.
- **Claude Desktop 완전 종료 안 함**: macOS 는 ⌘+Q, Windows 는 시스템 트레이에서 Quit. 단순 창 X 만 누르면 백그라운드 유지.
- **설정 파일 위치 오타**: 위 "설정 파일 위치" 표 다시 확인.

### 2. "LAW_OC 환경변수 없음" 경고가 stderr 에 보임

서버는 기동되지만 법제처 31개 primitive 호출이 실패합니다 (Layer C/Validator 일부 동작은 가능). 다음 중 하나:

- 설정 파일 `env` 블록의 `LAW_OC` 값이 placeholder (`your-api-key-here`) 그대로
- 따옴표 누락 (예: `"LAW_OC": your-api-key-here` ← 따옴표 없음)
- 방법 C 에서 `.env` 파일을 잘못된 위치에 둠 (프로젝트 루트 또는 `dist/` 의 부모 디렉터리에 있어야 함)

법제처 OPEN API 사이트에서 발급받은 정확한 키 (이메일 ID 형식) 인지 다시 확인.

### 3. 도구 호출은 되는데 응답에 `[NOT_FOUND]` 가 자주 뜸

정상 동작입니다. 본 MCP 는 **환각 방지 baseline** 으로 조회 실패 시 명시적 마커를 반환 — LLM 이 추측으로 메우는 것 차단. 그 자리에서 자동으로 다음 도구 후보 + 인자 예시도 노출되니 LLM 이 자연스럽게 이어 호출합니다.

### 4. 도메인 외 질의 (예: "민법 §750") 에 `[OUT_OF_SCOPE]`

정상 동작. Layer B+/Validator 는 PIPA 인용 검증·분야별 매핑 전용이라 도메인 외에서는 명시적으로 거부합니다. 일반 법령 질의는 Layer A primitive (`search_law`·`get_law_text` 등) 가 정상 처리하므로 LLM 이 자동으로 그쪽으로 라우팅합니다.

### 5. PIPC 결정문·헌재결정례 등 일부 도구가 빈 결과

법제처 OPEN API 가 반환하는 검색 결과는 **검색어·페이지** 에 매우 민감합니다. 동의어 (예: "마케팅" → "광고", "동의" → "consent" 같은 외래어) 로 재시도하거나 `intelligent_law_search` 의 자연어 질의로 바꿔 시도해 보세요. LLM 이 응답 끝에 노출되는 다음 도구 후보를 보고 자동으로 시도합니다.

### 6. 로그를 보고 싶음

Claude Desktop 의 MCP stderr 출력은 다음에 기록됩니다:

| OS | 경로 |
|---|---|
| macOS | `~/Library/Logs/Claude/mcp*.log` |
| Windows | `%APPDATA%\Claude\logs\mcp*.log` |

`korean-privacy-law-mcp` 서버 자신의 로그는 stderr 로만 나갑니다 (stdout 은 MCP 프로토콜 전용). 부팅 시:

```
[korean-privacy-law-mcp v0.0.1] stdio 서버 시작 (도구 37개 노출)
```

가 보이면 정상.

### 7. Windows 에서 `npx` 가 인식 안 됨

Node.js 설치 후 시스템 PATH 가 갱신되지 않은 경우. 새 PowerShell/CMD 창을 다시 열거나, 시스템 재부팅 후 다시 시도.

또는 절대경로로 지정:

```json
{
  "mcpServers": {
    "korean-privacy-law": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": ["-y", "korean-privacy-law-mcp"],
      "env": {
        "LAW_OC": "your-api-key-here"
      }
    }
  }
}
```

(`\\` 으로 이스케이프 — JSON 문법.)

### 8. 회사망 SSL 인증서 문제로 `npx` 또는 `npm install` 실패

회사 프록시·SSL 검사가 걸리는 경우. `npm config set strict-ssl false` 는 권장하지 않음. IT 부서에 회사 CA 인증서 등록을 요청하거나, 사외망 환경에서 미리 글로벌 설치 (방법 B) 후 사내에서 사용.

---

## 다음 단계

- 도구 37개 전체 카탈로그 + 사용 예시: [`README.md`](../README.md#-도구-구조-37개)
- 프로젝트 정체성·아키텍처·도구 인벤토리 (개발자용): [`CLAUDE.md`](../CLAUDE.md)
- RAG 코퍼스 라이선스 (인용·재배포 시 필수): [`data/hf_dataset/LICENSE.md`](../data/hf_dataset/LICENSE.md)

---

문제 신고 · 기능 제안: [GitHub Issues](https://github.com/scvcoder/korean-privacy-law-mcp/issues)
