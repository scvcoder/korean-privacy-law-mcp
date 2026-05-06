/**
 * MCP 서버 — 모든 도구를 ListTools/CallTool 핸들러에 등록.
 * 도메인 외 질의 처리: server-level metadata + 각 도구 description으로 LLM에게 범위 알림.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ALL_TOOLS, findTool } from "./tools/registry.js";
import type { LawApiClient } from "./client/law-api-client.js";
import { formatToolError } from "./lib/errors.js";
import { notFoundResponse } from "./lib/not-found.js";

export const SERVER_NAME = "korean-privacy-law-mcp";
export const SERVER_VERSION = "0.0.1";
export const SERVER_DESCRIPTION =
  "한국 개인정보보호법(PIPA) 전문 MCP. PIPA·시행령·PIPC 고시·의결례·" +
  "공식 가이드·상담사례 + 법제처 전체 API. 일반 법령 조회는 가능하지만 " +
  "다른 분야 깊은 분석은 한계.";

export function createServer(client: LawApiClient): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_DESCRIPTION,
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema, {
        target: "openApi3",
        $refStrategy: "none",
      }) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;

    const tool = findTool(name);
    if (!tool) {
      return notFoundResponse(`Unknown tool: ${name}`, [
        `사용 가능 도구는 ListTools로 확인 (총 ${ALL_TOOLS.length}개)`,
      ]);
    }

    try {
      const validated = tool.inputSchema.parse(rawArgs ?? {});
      return await tool.handler(validated, client);
    } catch (err) {
      return formatToolError(err, name);
    }
  });

  return server;
}
