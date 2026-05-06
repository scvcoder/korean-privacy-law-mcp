#!/usr/bin/env node
/**
 * korean-privacy-law-mcp HTTP 진입점.
 *
 * Stateful Streamable HTTP MCP — initialize 요청 시 세션 생성, Mcp-Session-Id 헤더로 후속 라우팅.
 * Hugging Face Spaces · fly.io · Cloud Run 등 컨테이너 환경 배포용.
 *
 * API 키(LAW_OC) 전달 방법 (initialize 요청 시 1회 — 위에서부터 우선):
 *   1. `?oc=KEY` · `?LAW_OC=KEY` 쿼리 파라미터  (Claude.ai 커스텀 커넥터 URL 기본 패턴)
 *   2. `apikey` · `law-oc` · `x-law-oc` · `Authorization: Bearer KEY` 헤더
 *   3. `LAW_OC` 환경변수                          (서버 운영자 기본 키, fallback)
 */

import { randomUUID } from "node:crypto";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { LawApiClient } from "./client/law-api-client.js";
import { loadEnv } from "./lib/env.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { ALL_TOOLS } from "./tools/registry.js";

loadEnv();

const PORT = Number(process.env.PORT ?? 7860);
const HOST = process.env.HOST ?? "0.0.0.0";
const DEFAULT_OC = process.env.LAW_OC;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const SESSION_MAX_IDLE_MS = 30 * 60 * 1000; // 30분

interface SessionEntry {
  server: Server;
  transport: StreamableHTTPServerTransport;
  lastAccess: number;
}

const sessions = new Map<string, SessionEntry>();

function logEvent(msg: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [${SERVER_NAME}] ${msg}\n`);
}

function extractApiKey(req: Request): string | undefined {
  // 헤더 우선 (다양한 이름 지원)
  const headerCandidates = [
    req.header("apikey"),
    req.header("law-oc"),
    req.header("law_oc"),
    req.header("x-law-oc"),
    req.header("x-api-key"),
    req.header("authorization")?.replace(/^Bearer\s+/i, ""),
  ];
  for (const candidate of headerCandidates) {
    if (candidate && candidate.length > 0) return candidate;
  }
  // 쿼리 파라미터
  const queryCandidates = [req.query.oc, req.query.LAW_OC];
  for (const candidate of queryCandidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return DEFAULT_OC;
}

const app = express();
app.use(express.json({ limit: "4mb" }));

// CORS — Claude.ai 같은 브라우저 클라이언트가 mcp-session-id 헤더를 동반한
// 후속 요청에 preflight(OPTIONS) 를 보내므로 명시적 허용 필요.
app.use((req, res, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, mcp-session-id, last-event-id, apikey, law-oc, x-law-oc, x-api-key"
  );
  res.header("Access-Control-Expose-Headers", "mcp-session-id");
  res.header("Access-Control-Max-Age", "600");
  res.header("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// idle 세션 자동 정리 (5분마다 체크, 30분 idle 시 종료)
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of sessions) {
    if (now - entry.lastAccess > SESSION_MAX_IDLE_MS) {
      logEvent(`session ${sid.slice(0, 8)} idle timeout — cleaning up`);
      try {
        void entry.transport.close();
        void entry.server.close();
      } catch {
        /* ignore */
      }
      sessions.delete(sid);
    }
  }
}, 5 * 60 * 1000).unref();

app.get("/", (_req, res) => {
  res.json({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    transport: "streamable-http",
    mode: "stateful",
    endpoint: "/mcp",
    tools: ALL_TOOLS.length,
    activeSessions: sessions.size,
    docs: "https://github.com/scvcoder/korean-privacy-law-mcp",
    apiKey: {
      required: true,
      methods: [
        "?oc=YOUR_KEY (query)",
        "apikey: YOUR_KEY (header)",
        "x-law-oc: YOUR_KEY (header)",
      ],
      issue: "https://open.law.go.kr/LSO/openApi/guideResult.do",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id");

  try {
    if (sessionId) {
      const entry = sessions.get(sessionId);
      if (entry) {
        entry.lastAccess = Date.now();
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }
      logEvent(`POST /mcp — unknown session ${sessionId.slice(0, 8)}, returning 404 for re-init`);
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found. Please reinitialize." },
        id: null,
      });
      return;
    }

    // 새 세션 — initialize 요청만 허용
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "법제처 API 키 (LAW_OC) 미지정. ?oc=YOUR_KEY 쿼리 파라미터 또는 'apikey' 헤더로 전달하세요. " +
            "발급: https://open.law.go.kr/LSO/openApi/guideResult.do",
        },
        id: null,
      });
      return;
    }

    const newId = randomUUID();
    const client = new LawApiClient({ apiKey });
    const server = createServer(client);
    const eventStore = new InMemoryEventStore();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newId,
      enableJsonResponse: true,
      eventStore,
      onsessioninitialized: (id) => {
        sessions.set(id, { server, transport, lastAccess: Date.now() });
        logEvent(`session ${id.slice(0, 8)} initialized (active=${sessions.size})`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && sessions.has(sid)) {
        sessions.delete(sid);
        logEvent(`session ${sid.slice(0, 8)} closed (active=${sessions.size})`);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logEvent(`POST /mcp error: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id");
  const entry = sessionId ? sessions.get(sessionId) : undefined;
  if (!entry) {
    logEvent(`GET /mcp — unknown session ${sessionId?.slice(0, 8) ?? "(none)"}`);
    res.status(404).send("Session not found. Please reinitialize.");
    return;
  }
  entry.lastAccess = Date.now();
  try {
    await entry.transport.handleRequest(req, res);
  } catch (err) {
    logEvent(`GET /mcp error: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
});

app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id");
  const entry = sessionId ? sessions.get(sessionId) : undefined;
  if (!entry) {
    res.status(404).send("Session not found");
    return;
  }
  try {
    await entry.transport.handleRequest(req, res);
    sessions.delete(sessionId!);
    logEvent(`session ${sessionId!.slice(0, 8)} terminated by client`);
  } catch (err) {
    logEvent(`DELETE /mcp error: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) res.status(500).send("Error processing session termination");
  }
});

const expressServer = app.listen(PORT, HOST, () => {
  logEvent(
    `v${SERVER_VERSION} HTTP MCP 서버 시작 — ${HOST}:${PORT}/mcp (stateful, JSON-response, 도구 ${ALL_TOOLS.length}개)`
  );
  if (!DEFAULT_OC) {
    logEvent(
      `LAW_OC 미설정 — 사용자가 initialize 시 ?oc=KEY 또는 apikey 헤더로 전달해야 함.`
    );
  }
});

async function gracefulShutdown(signal: string): Promise<void> {
  logEvent(`${signal} received, shutting down...`);
  for (const [sid, entry] of sessions) {
    try {
      await entry.transport.close();
      await entry.server.close();
    } catch {
      /* ignore */
    }
    sessions.delete(sid);
  }
  expressServer.close();
  logEvent("server shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
