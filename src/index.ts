#!/usr/bin/env node
/**
 * korean-privacy-law-mcp 진입점.
 * stdio MCP 서버 시작.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LawApiClient } from "./client/law-api-client.js";
import { loadEnv } from "./lib/env.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { ALL_TOOLS } from "./tools/registry.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // setup 서브커맨드: npx korean-privacy-law-mcp setup
  // (npm publish 전에는 node dist/index.js setup 으로 호출)
  if (args[0] === "setup") {
    const { runSetup } = await import("./scripts/setup.js");
    await runSetup();
    return;
  }

  // uninstall 서브커맨드: 클라이언트 설정 + npx 캐시 일괄 정리
  // 예: npx korean-privacy-law-mcp@latest uninstall
  //     korean-privacy-law-mcp uninstall   (글로벌 설치)
  if (args[0] === "uninstall") {
    const { runUninstall } = await import("./scripts/uninstall.js");
    await runUninstall();
    return;
  }

  // 1순위: cwd/.env (개발 시: `npm run dev` 프로젝트 루트에서)
  loadEnv();
  // 2순위: 스크립트 디렉터리 기준 ../.env
  // (Claude Desktop은 임의 cwd로 spawn — script-relative로 프로젝트 .env 도달)
  if (!process.env.LAW_OC) {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    loadEnv({ path: resolve(scriptDir, "..", ".env"), force: true });
  }

  if (!process.env.LAW_OC) {
    // stderr로만 안내 — stdout은 MCP 프로토콜 전용
    process.stderr.write(
      `[${SERVER_NAME} v${SERVER_VERSION}] WARNING: LAW_OC 환경변수 없음. ` +
        `법제처 API 호출 시 실패. .env 파일에 LAW_OC=... 설정 또는 환경변수 직접 지정.\n`
    );
  }

  const client = new LawApiClient();
  const server = createServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[${SERVER_NAME} v${SERVER_VERSION}] stdio 서버 시작 (도구 ${ALL_TOOLS.length}개 노출)\n`
  );
}

main().catch((err) => {
  process.stderr.write(
    `[${SERVER_NAME}] fatal: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
