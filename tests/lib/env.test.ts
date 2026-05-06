import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEnv, _resetLoadedFlag } from "../../src/lib/env.js";

let tempDir: string;

beforeEach(() => {
  _resetLoadedFlag();
  tempDir = mkdtempSync(join(tmpdir(), "kpl-env-"));
});

function makeEnvFile(content: string): string {
  const path = join(tempDir, ".env");
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("loadEnv", () => {
  it("기본 KEY=VALUE 파싱", () => {
    delete process.env.TEST_KEY_BASIC;
    const path = makeEnvFile("TEST_KEY_BASIC=hello");
    loadEnv({ path });
    expect(process.env.TEST_KEY_BASIC).toBe("hello");
    rmSync(tempDir, { recursive: true });
  });

  it("# 주석 라인 무시", () => {
    delete process.env.TEST_KEY_COMMENT;
    const path = makeEnvFile("# this is a comment\nTEST_KEY_COMMENT=value");
    loadEnv({ path });
    expect(process.env.TEST_KEY_COMMENT).toBe("value");
    rmSync(tempDir, { recursive: true });
  });

  it("따옴표 제거 (단/복)", () => {
    delete process.env.TEST_KEY_QUOTE_DOUBLE;
    delete process.env.TEST_KEY_QUOTE_SINGLE;
    const path = makeEnvFile(`TEST_KEY_QUOTE_DOUBLE="hello world"\nTEST_KEY_QUOTE_SINGLE='single'`);
    loadEnv({ path });
    expect(process.env.TEST_KEY_QUOTE_DOUBLE).toBe("hello world");
    expect(process.env.TEST_KEY_QUOTE_SINGLE).toBe("single");
    rmSync(tempDir, { recursive: true });
  });

  it("기존 process.env 키는 덮어쓰지 않음", () => {
    process.env.TEST_KEY_EXISTING = "system";
    const path = makeEnvFile("TEST_KEY_EXISTING=fromEnvFile");
    loadEnv({ path });
    expect(process.env.TEST_KEY_EXISTING).toBe("system");
    delete process.env.TEST_KEY_EXISTING;
    rmSync(tempDir, { recursive: true });
  });

  it("파일이 없으면 조용히 패스", () => {
    expect(() => loadEnv({ path: "/nonexistent/.env" })).not.toThrow();
  });

  it("idempotent — 두 번째 호출은 no-op", () => {
    delete process.env.TEST_KEY_IDEM;
    const path = makeEnvFile("TEST_KEY_IDEM=first");
    loadEnv({ path });
    expect(process.env.TEST_KEY_IDEM).toBe("first");

    // 두 번째 호출은 force 없으면 no-op
    process.env.TEST_KEY_IDEM = "modified";
    loadEnv({ path });
    expect(process.env.TEST_KEY_IDEM).toBe("modified");

    delete process.env.TEST_KEY_IDEM;
    rmSync(tempDir, { recursive: true });
  });

  it("force=true 면 재로딩 (기존 process.env 키는 여전히 보호)", () => {
    delete process.env.TEST_KEY_FORCE;
    const path = makeEnvFile("TEST_KEY_FORCE=value");
    loadEnv({ path });
    _resetLoadedFlag();
    delete process.env.TEST_KEY_FORCE;
    loadEnv({ path, force: true });
    expect(process.env.TEST_KEY_FORCE).toBe("value");
    delete process.env.TEST_KEY_FORCE;
    rmSync(tempDir, { recursive: true });
  });

  it("=가 없는 라인 무시", () => {
    delete process.env.TEST_KEY_NOEQ;
    const path = makeEnvFile("invalid line\nTEST_KEY_NOEQ=ok");
    loadEnv({ path });
    expect(process.env.TEST_KEY_NOEQ).toBe("ok");
    rmSync(tempDir, { recursive: true });
  });
});
