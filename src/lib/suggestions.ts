/**
 * 응답 끝 "이어서 할 수 있는 조회" 자동 생성기.
 * Chain 도구 없이도 LLM이 자연스럽게 다음 도구로 이어가도록 유도.
 */

export interface ToolSuggestion {
  /** 호출할 도구 이름 */
  tool: string;
  /** 인자 예시 (선택) */
  args?: Record<string, unknown>;
  /** 왜 이 도구를 권유하는가 */
  reason: string;
}

export function formatSuggestions(suggestions: ToolSuggestion[]): string {
  if (!suggestions.length) return "";
  const lines = ["", "이어서 할 수 있는 조회:"];
  for (const s of suggestions) {
    const argStr = s.args ? formatArgs(s.args) : "";
    lines.push(`  • ${s.tool}(${argStr}) — ${s.reason}`);
  }
  return lines.join("\n");
}

export function appendSuggestions(text: string, suggestions: ToolSuggestion[]): string {
  const formatted = formatSuggestions(suggestions);
  return formatted ? `${text}\n${formatted}` : text;
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
}
