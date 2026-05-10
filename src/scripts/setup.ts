#!/usr/bin/env node

/**
 * korean-privacy-law-mcp setup wizard
 *
 * 사용:
 *   npx korean-privacy-law-mcp setup        # npm publish 후
 *   node dist/index.js setup                # 로컬 빌드에서
 *
 * 흐름:
 *   1. API 키 입력 (필수)
 *   2. 운영 모드 선택 — 로컬 stdio (npx) / 원격 HF Space
 *   3. AI 클라이언트 다중 선택 (Claude Desktop · Code · Cursor · VS Code · Windsurf)
 *   4. 각 클라이언트의 mcpServers JSON 자동 업데이트
 *
 * 디자인 참고: scvcoder/korean-law-alio-mcp src/scripts/setup.ts.
 * 우리 차이: ALIO 데이터 fetch 단계 없음 (RAG 코퍼스가 npm 패키지에 번들).
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/** 패키지 버전을 package.json 에서 동적으로 읽음 — npm publish 마다 자동 동기화 */
function readPackageVersion(): string {
  try {
    // dist/scripts/setup.js → ../../package.json (패키지 루트)
    const here = fileURLToPath(import.meta.url);
    const pkgPath = resolve(dirname(here), "..", "..", "package.json");
    const raw = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "?";
  } catch {
    return "?";
  }
}

const REMOTE_URL = "https://scvcoder-korean-privacy-law-mcp.hf.space/mcp";
const SERVER_NAME = "korean-privacy-law";
const NPM_PACKAGE = "korean-privacy-law-mcp";

export interface ClientConfig {
  readonly name: string;
  readonly configPath: string;
  readonly format: "mcpServers";
}

export function detectClients(): readonly ClientConfig[] {
  const home = homedir();
  const clients: ClientConfig[] = [];

  // Claude Desktop — OS 별 경로
  const claudePaths: Record<string, string> = {
    darwin: resolve(home, "Library/Application Support/Claude/claude_desktop_config.json"),
    win32: resolve(
      process.env.APPDATA ?? resolve(home, "AppData/Roaming"),
      "Claude/claude_desktop_config.json"
    ),
    linux: resolve(home, ".config/Claude/claude_desktop_config.json"),
  };
  const claudePath = claudePaths[process.platform];
  if (claudePath) {
    clients.push({ name: "Claude Desktop", configPath: claudePath, format: "mcpServers" });
  }

  // Claude Code (project-level .mcp.json)
  clients.push({
    name: "Claude Code (project .mcp.json)",
    configPath: resolve(process.cwd(), ".mcp.json"),
    format: "mcpServers",
  });

  // Cursor (user-level)
  clients.push({
    name: "Cursor",
    configPath: resolve(home, ".cursor/mcp.json"),
    format: "mcpServers",
  });

  // VS Code (project-level)
  clients.push({
    name: "VS Code (project .vscode/mcp.json)",
    configPath: resolve(process.cwd(), ".vscode/mcp.json"),
    format: "mcpServers",
  });

  // Windsurf (user-level)
  clients.push({
    name: "Windsurf",
    configPath: resolve(home, ".codeium/windsurf/mcp_config.json"),
    format: "mcpServers",
  });

  return clients;
}

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {};
  const raw = await readFile(path, "utf-8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

async function writeJsonFile(path: string, data: Record<string, unknown>): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

type InstallMode =
  | { type: "remote"; url: string }
  | { type: "local"; buildPath: string }
  | { type: "global" };

function buildServerEntry(
  apiKey: string,
  mode: InstallMode,
  clientName?: string
): Record<string, unknown> {
  if (mode.type === "remote") {
    const url = apiKey ? `${mode.url}?oc=${encodeURIComponent(apiKey)}` : mode.url;
    // Claude Desktop streamable-HTTP 직접 등록 시 알려진 버그
    // (anthropics/claude-ai-mcp#211) 로 mcp-remote stdio 브릿지 사용.
    if (clientName === "Claude Desktop") {
      return { command: "npx", args: ["mcp-remote", url] };
    }
    return { url };
  }
  const env: Record<string, string> = {};
  if (apiKey) env.LAW_OC = apiKey;
  if (mode.type === "global") {
    return { command: "npx", args: ["-y", NPM_PACKAGE], env };
  }
  return { command: "node", args: [mode.buildPath], env };
}

// ─────────────────────────────────────────
// ANSI helpers (no deps)
// ─────────────────────────────────────────
const ESC = "\x1b[";
const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  cyan: `${ESC}36m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  red: `${ESC}31m`,
  white: `${ESC}37m`,
} as const;

function printBanner(): void {
  console.log();
  console.log(`  ${c.bold}${c.cyan}Korean Privacy Law MCP — Setup Wizard${c.reset}`);
  console.log(
    `  ${c.dim}한국 개인정보보호법(PIPA) 전문 MCP — 법제처 자료와 개인정보포털 자료의 연계 활용${c.reset}`
  );
  console.log();
  console.log(`  ${c.dim}${"━".repeat(64)}${c.reset}`);
  console.log();
}

function stepHeader(step: number, total: number, title: string): void {
  console.log(
    `  ${c.cyan}${c.bold}[${step}/${total}]${c.reset} ${c.white}${c.bold}${title}${c.reset}`
  );
  console.log();
}

function ok(label: string, detail = ""): void {
  console.log(
    `  ${c.green}✓${c.reset} ${c.white}${label}${c.reset}${detail ? `\n    ${c.dim}${detail}${c.reset}` : ""}`
  );
}

function fail(label: string, detail: string): void {
  console.log(`  ${c.red}✗${c.reset} ${c.white}${label}${c.reset}\n    ${c.dim}${detail}${c.reset}`);
}

function detectLocalBuild(): string | null {
  // 자기 위치(dist/scripts/setup.js) → 한 단 위 dist 디렉터리 → index.js
  const here = fileURLToPath(import.meta.url);
  const indexPath = resolve(dirname(here), "..", "index.js");
  return existsSync(indexPath) ? indexPath : null;
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

/** readline.question 안전판 — stdin EOF 시 빈 문자열 반환 */
async function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  try {
    const ans = await rl.question(prompt);
    return ans.trim();
  } catch {
    return "";
  }
}

export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    printBanner();

    // ── Step 1: API 키 (필수) ──
    stepHeader(1, 3, "법제처 OPEN API 키 (필수)");
    console.log(
      `  ${c.dim}발급(무료, 1분): https://open.law.go.kr/LSO/openApi/guideResult.do${c.reset}`
    );
    console.log();
    let apiKey = "";
    while (!apiKey) {
      apiKey = await ask(rl, `  ${c.cyan}>${c.reset} API 키: `);
      if (!apiKey) {
        console.log(
          `  ${c.red}!${c.reset} API 키는 필수입니다. 발급 후 입력하세요 (Ctrl+C 로 종료).`
        );
      }
    }
    ok("키 등록됨");
    console.log();

    // ── Step 2: 운영 모드 ──
    stepHeader(2, 3, "운영 모드 선택");
    const localBuild = detectLocalBuild();
    if (localBuild) {
      console.log(
        `  ${c.cyan}1${c.reset}) ${c.white}로컬 모드${c.reset}  ${c.dim}— stdio + ${localBuild}${c.reset}`
      );
      console.log(`     ${c.dim}자기 PC 에서 실행 — 빠르고 안정적${c.reset}`);
    } else {
      console.log(`  ${c.dim}1) 로컬 모드 — 빌드 미감지 (npm run build 후 다시 실행)${c.reset}`);
    }
    console.log(
      `  ${c.cyan}2${c.reset}) ${c.white}원격 모드${c.reset}    ${c.dim}— 운영자 HF Space 사용 (${REMOTE_URL})${c.reset}`
    );
    console.log(
      `     ${c.dim}원격지에서 실행  - 약간느림${c.reset}`
    );
    console.log();
    let modeInput = "";
    while (true) {
      modeInput = (await ask(rl, `  ${c.cyan}>${c.reset} 번호 [기본=1]: `)) || "1";
      if (modeInput === "1" || modeInput === "2") break;
      console.log(`  ${c.red}!${c.reset} 1 또는 2 만 입력 가능합니다. 다시 입력하세요.`);
    }

    let mode: InstallMode;
    if (modeInput === "1" && localBuild) {
      mode = { type: "local", buildPath: localBuild };
      ok("로컬 모드", localBuild);
    } else if (modeInput === "1" && !localBuild) {
      // 로컬 빌드 미감지 → 자동 원격 fallback
      mode = { type: "remote", url: REMOTE_URL };
      ok("원격 모드 (로컬 빌드 미감지로 자동 전환)", REMOTE_URL);
    } else {
      mode = { type: "remote", url: REMOTE_URL };
      ok("원격 모드", REMOTE_URL);
    }
    console.log();

    // ── Step 3: 클라이언트 선택 ──
    stepHeader(3, 3, "MCP 클라이언트 선택 (다중 가능, 쉼표 구분)");
    const clients = detectClients();
    const detectedFlags = clients.map((cl) => existsSync(cl.configPath));
    clients.forEach((cl, i) => {
      const badge = detectedFlags[i] ? ` ${c.green}[감지됨]${c.reset}` : "";
      console.log(
        `  ${c.cyan}${String(i + 1).padStart(2)}${c.reset}) ${c.white}${cl.name}${c.reset}${badge}`
      );
      console.log(`      ${c.dim}${cl.configPath}${c.reset}`);
    });
    console.log(`  ${c.dim} 0) 자동 등록 안 함 — 수동 설정 안내만 출력${c.reset}`);
    console.log();

    // 디폴트: 감지된 클라이언트 모두 (예: "1,3"). 감지 0건이면 디폴트 없음.
    const detectedDefault = clients
      .map((_, i) => (detectedFlags[i] ? String(i + 1) : null))
      .filter((s): s is string => s !== null)
      .join(",");
    const promptText = detectedDefault
      ? `  ${c.cyan}>${c.reset} 번호 (예: 1,3) [기본=감지된 ${detectedDefault}]: `
      : `  ${c.cyan}>${c.reset} 번호 (예: 1,3): `;

    let clientInput = "";
    let indices: number[] = [];
    while (true) {
      clientInput = (await ask(rl, promptText)) || detectedDefault;
      if (!clientInput) {
        console.log(`  ${c.red}!${c.reset} 1개 이상 선택하거나 0 (수동 안내) 을 입력하세요.`);
        continue;
      }
      if (clientInput === "0") {
        console.log();
        printManualConfig(apiKey, mode);
        return;
      }
      // 모든 토큰 검증 — 하나라도 잘못된 번호면 재요청
      const tokens = clientInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsed = tokens.map((t) => ({ token: t, idx: parseInt(t, 10) - 1 }));
      const invalid = parsed.filter(
        (p) => !/^\d+$/.test(p.token) || p.idx < 0 || p.idx >= clients.length
      );
      if (invalid.length > 0) {
        console.log(
          `  ${c.red}!${c.reset} 유효하지 않은 번호: ${invalid
            .map((p) => p.token)
            .join(", ")}. 1~${clients.length} 범위로 다시 입력하세요.`
        );
        continue;
      }
      // 감지되지 않은 클라이언트 차단 — 설치 흔적이 없는데 config 만 만들면
      // 사용자 PC 에 의미 없는 파일이 생성됨. 해당 클라이언트가 실제 설치되고
      // 한 번이라도 실행되어 config 디렉터리/파일이 만들어진 후에 setup 권장.
      const undetected = parsed.filter((p) => !detectedFlags[p.idx]);
      if (undetected.length > 0) {
        console.log(
          `  ${c.red}!${c.reset} 감지되지 않은 클라이언트: ${undetected
            .map((p) => `${p.token} (${clients[p.idx].name})`)
            .join(", ")}.`
        );
        console.log(
          `    ${c.dim}해당 클라이언트가 설치되고 최소 한 번 실행되어 있어야 합니다. 수동 설정은 0 입력.${c.reset}`
        );
        continue;
      }
      indices = parsed.map((p) => p.idx);
      if (indices.length === 0) {
        console.log(`  ${c.red}!${c.reset} 유효한 번호가 없습니다. 다시 입력하세요.`);
        continue;
      }
      break;
    }

    // ── 설정 파일 업데이트 ──
    console.log();
    console.log(`  ${c.cyan}${c.bold}[저장]${c.reset} ${c.white}${c.bold}설정 파일 업데이트${c.reset}`);
    console.log();

    for (const idx of indices) {
      const client = clients[idx];
      try {
        const entry = buildServerEntry(apiKey, mode, client.name);
        const config = await readJsonFile(client.configPath);
        const servers = (config[client.format] ?? {}) as Record<string, unknown>;
        servers[SERVER_NAME] = entry;
        config[client.format] = servers;
        await writeJsonFile(client.configPath, config);
        ok(client.name, client.configPath);
      } catch (err) {
        fail(client.name, err instanceof Error ? err.message : String(err));
      }
    }

    printComplete(mode);
  } finally {
    rl.close();
  }
}

function printComplete(_mode: InstallMode): void {
  console.log();
  console.log(`  ${c.green}${c.bold}╔${"═".repeat(58)}╗${c.reset}`);
  console.log(
    `  ${c.green}${c.bold}║${c.reset}${" ".repeat(20)}${c.green}${c.bold}Setup Complete!${c.reset}${" ".repeat(23)}${c.green}${c.bold}║${c.reset}`
  );
  console.log(`  ${c.green}${c.bold}╚${"═".repeat(58)}╝${c.reset}`);
  console.log();

  const version = readPackageVersion();
  console.log(`  ${c.dim}v${version} 버전으로 설치가 완료되었습니다.${c.reset}`);
  console.log(
    `  ${c.dim}AI 클라이언트를 ${c.bold}완전 종료 후 재시작${c.reset}${c.dim}하면 ${c.bold}${SERVER_NAME}${c.reset}${c.dim} MCP 서버가 활성화됩니다.${c.reset}`
  );
  console.log();
}

function printManualConfig(apiKey: string, mode: InstallMode): void {
  const entry = buildServerEntry(apiKey, mode);
  console.log(`  ${c.dim}아래 JSON 을 클라이언트 설정 파일의 mcpServers 에 추가하세요:${c.reset}`);
  console.log();
  console.log(
    `  ${c.cyan}"${SERVER_NAME}"${c.reset}: ${JSON.stringify(entry, null, 4)
      .split("\n")
      .join("\n  ")}`
  );
  console.log();
}
