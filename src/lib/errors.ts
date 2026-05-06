import type { ToolResponse } from "./not-found.js";

/** 법제처 API 호출 실패 등 외부 의존 에러 */
export class LawApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LawApiError";
  }
}

/** 입력 검증 실패 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** 모든 도구 응답에 공통 적용. API 키 마스킹 포함. */
export function formatToolError(error: unknown, toolName: string): ToolResponse {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `[ERROR] ${toolName}: ${maskApiKey(message)}` }],
    isError: true,
  };
}

/** 에러 메시지·로그에 OC API 키가 노출되지 않도록 마스킹 */
export function maskApiKey(text: string): string {
  return text.replace(/OC=[^&\s]+/gi, "OC=***");
}
