/**
 * 표준 머신 파싱 마커 + 응답 헬퍼.
 * LLM이 실패·범위 외 상황을 환각으로 메우지 않도록 명시 시그널을 제공한다.
 */

export const MARKERS = {
  /** 조회 실패 */
  NOT_FOUND: "[NOT_FOUND]",
  /** verify 실패 — 환각 검출 */
  HALLUCINATION_DETECTED: "[HALLUCINATION_DETECTED]",
  /** 도메인 외 입력 (Layer A+/B/Validator 전용) */
  OUT_OF_SCOPE: "[OUT_OF_SCOPE]",
  /** 코퍼스 비매칭 (Layer C 전용) */
  NOT_FOUND_SCOPE: "[NOT_FOUND_SCOPE]",
} as const;

export type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export const LLM_WARNING = "⚠️ LLM은 추측·생성 금지. 정확한 답이 없으면 그렇게 사용자에게 알려주세요.";

export function notFoundResponse(message: string, suggestions: string[] = []): ToolResponse {
  let text = `${MARKERS.NOT_FOUND} ${message}\n${LLM_WARNING}`;
  if (suggestions.length) {
    text += "\n\n이어서 시도할 수 있는 조회:\n" + suggestions.map((s) => `  • ${s}`).join("\n");
  }
  return { content: [{ type: "text", text }], isError: true };
}

export function outOfScopeResponse(
  toolName: string,
  reason: string,
  alternatives: string[] = []
): ToolResponse {
  let text = `${MARKERS.OUT_OF_SCOPE} ${toolName}: ${reason}\n${LLM_WARNING}`;
  if (alternatives.length) {
    text += "\n\n대신 사용 가능한 도구:\n" + alternatives.map((a) => `  • ${a}`).join("\n");
  }
  return { content: [{ type: "text", text }], isError: true };
}

export function notFoundScopeResponse(
  corpusName: string,
  query: string,
  alternatives: string[] = []
): ToolResponse {
  let text = `${MARKERS.NOT_FOUND_SCOPE} ${corpusName}에 "${query}" 매칭 없음.\n본 코퍼스는 개인정보 분야만 다룹니다.`;
  if (alternatives.length) {
    text += "\n\n다른 자료원:\n" + alternatives.map((a) => `  • ${a}`).join("\n");
  }
  return { content: [{ type: "text", text }] };
}

export function hallucinationDetectedResponse(citation: string, evidence: string): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: `${MARKERS.HALLUCINATION_DETECTED} ${citation}\n${evidence}\n${LLM_WARNING}`,
      },
    ],
    isError: true,
  };
}
