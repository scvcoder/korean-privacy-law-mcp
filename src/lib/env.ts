/**
 * 경량 .env 로더 — 외부 의존 없이 process.env에 키 주입.
 * 이미 process.env에 있는 키는 덮어쓰지 않음 (시스템 환경변수 우선).
 * 호출 1회 후 idempotent.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

export interface LoadEnvOptions {
  /** .env 경로 (기본: cwd의 .env) */
  path?: string;
  /** 강제 재로딩 (기본 false) */
  force?: boolean;
}

export function loadEnv(options: LoadEnvOptions = {}): void {
  if (loaded && !options.force) return;
  loaded = true;

  const fullPath = resolve(options.path ?? ".env");
  if (!existsSync(fullPath)) return;

  const content = readFileSync(fullPath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.substring(0, eq).trim();
    let value = line.substring(eq + 1).trim();

    // 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/** 테스트 전용 — loaded 플래그 리셋 */
export function _resetLoadedFlag(): void {
  loaded = false;
}
