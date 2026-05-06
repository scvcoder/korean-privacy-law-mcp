/**
 * MCP 도구 표준 인터페이스.
 * 모든 primitive·hint·validator·corpus 도구는 이 형태로 export.
 */

import type { z } from "zod";
import type { LawApiClient } from "../client/law-api-client.js";
import type { ToolResponse } from "../lib/not-found.js";

export interface Tool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  /** MCP 도구 이름 (snake_case) */
  name: string;
  /** LLM이 도구 선택 시 사용. 무엇·언제·다음 도구·한계 4요소 */
  description: string;
  /** zod 입력 스키마 */
  inputSchema: TSchema;
  /** 비동기 핸들러 — 실패는 throw 대신 ToolResponse(isError=true) 반환 */
  handler(args: z.infer<TSchema>, client: LawApiClient): Promise<ToolResponse>;
}

/** 도구 카테고리 — 등록 시 메타데이터 */
export type ToolCategory = "primitive" | "domain" | "hint" | "corpus" | "validator";
