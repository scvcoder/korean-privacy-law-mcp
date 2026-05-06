import { z } from "zod";
import type { Tool } from "../types.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError, ValidationError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const MAX_BODY_CHARS = 12_000;

const inputSchema = z
  .object({
    mst: z.string().optional().describe("법령일련번호 (search_law 결과의 mst)"),
    lawId: z.string().optional().describe("법령ID (search_law 결과의 lawId)"),
  })
  .refine((d) => d.mst || d.lawId, {
    message: "mst 또는 lawId 중 하나는 필수입니다",
  });

interface BasicInfo {
  법령ID?: string;
  법령일련번호?: string;
  법령명?: string;
  행정규칙ID?: string;
  행정규칙일련번호?: string;
  행정규칙명?: string;
  법종구분?: { content?: string } | string;
  시행일자?: string;
  발령일자?: string;
}

interface SystemTreeResponse {
  법령체계도?: {
    기본정보?: BasicInfo;
    상하위법?: unknown;
    관련법령?: unknown;
  };
}

function getName(info: BasicInfo): string {
  return (
    info.법령명 ??
    info.행정규칙명 ??
    "(이름 없음)"
  );
}

function getId(info: BasicInfo): string {
  return (
    info.법령ID ??
    info.행정규칙ID ??
    info.법령일련번호 ??
    info.행정규칙일련번호 ??
    ""
  );
}

function getDate(info: BasicInfo): string {
  return info.시행일자 ?? info.발령일자 ?? "";
}

/**
 * 트리 재귀 포맷터.
 * 법령체계도는 깊은 nested 객체 — { type: { subtype: { 기본정보: {...}, 또는 더 깊이 } } }
 * 각 레벨에 `기본정보`가 있으면 항목 출력, 그 외 키는 sub-카테고리.
 */
function formatTree(
  node: unknown,
  indent: number,
  out: { text: string; truncated: boolean }
): void {
  if (out.truncated) return;
  if (out.text.length > MAX_BODY_CHARS) {
    out.text += `\n⋯ 이하 생략 (12,000자 한도) ⋯\n`;
    out.truncated = true;
    return;
  }
  if (!node || typeof node !== "object") return;

  // 배열은 각 요소를 동일 들여쓰기로
  if (Array.isArray(node)) {
    for (const item of node) formatTree(item, indent, out);
    return;
  }

  const obj = node as Record<string, unknown>;
  const prefix = "  ".repeat(indent);

  // 이 노드 자체에 기본정보 → 항목 출력
  if (obj.기본정보 && typeof obj.기본정보 === "object") {
    const info = obj.기본정보 as BasicInfo;
    const name = getName(info);
    const id = getId(info);
    const date = getDate(info);
    out.text += `${prefix}- ${name}`;
    if (id) out.text += ` (id=${id})`;
    if (date) out.text += ` · ${date}`;
    out.text += "\n";
  }

  // 자식 노드 walk (기본정보 외)
  for (const [key, value] of Object.entries(obj)) {
    if (key === "기본정보") continue;
    if (!value || typeof value !== "object") continue;

    // type 헤더 출력 (법률·시행령·시행규칙·행정규칙·고시·훈령·예규 등)
    out.text += `${prefix}[${key}]\n`;
    formatTree(value, indent + 1, out);
  }
}

export const getLawSystemTree: Tool<typeof inputSchema> = {
  name: "get_law_system_tree",
  description:
    "법령 체계도 — 트리 시각화 (법제처 lawService · target=lsStmd). " +
    "법률 → 시행령 → 시행규칙 → 행정규칙(고시·훈령·예규) 계층을 들여쓰기 트리로 표시. " +
    "get_related_laws와 endpoint 공유하지만 출력 형태가 트리(체계 이해용) vs 평탄 list(검색·발견용). " +
    "다음: get_law_text(mst·lawId)로 특정 노드 본문, get_delegated_laws(lawId)로 위임조문 매핑.",
  inputSchema,

  async handler(args, client) {
    try {
      if (!args.mst && !args.lawId) {
        throw new ValidationError("mst 또는 lawId 필수");
      }

      const extraParams: Record<string, string> = {};
      if (args.mst) extraParams.MST = args.mst;
      else if (args.lawId) extraParams.ID = args.lawId;

      const jsonText = await client.fetchApi({
        endpoint: "lawService.do",
        target: "lsStmd",
        type: "JSON",
        extraParams,
      });

      let parsed: SystemTreeResponse;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return notFoundResponse(
          `법령 체계도 응답 파싱 실패 (mst=${args.mst ?? "-"}, lawId=${args.lawId ?? "-"})`,
          [`search_law(query="...") — 유효한 mst·lawId 확인`]
        );
      }

      const tree = parsed.법령체계도;
      if (!tree) {
        return notFoundResponse(
          `법령 체계도 데이터 없음 (mst=${args.mst ?? "-"}, lawId=${args.lawId ?? "-"})`,
          [`search_law(query="...") — 유효한 식별자 확인`]
        );
      }

      const baseInfo = tree.기본정보 ?? {};
      const baseName = baseInfo.법령명 ?? "(법령명 없음)";
      const baseDate = baseInfo.시행일자 ?? "";

      let text = `=== ${baseName} 법령 체계도 ===\n`;
      if (baseInfo.법령ID) text += `lawId: ${baseInfo.법령ID}`;
      if (baseInfo.법령일련번호) text += ` / mst: ${baseInfo.법령일련번호}`;
      text += "\n";
      if (baseDate) text += `시행: ${baseDate}\n`;
      text += "\n";

      const out = { text: "", truncated: false };

      // 상하위법 트리
      if (tree.상하위법 && Object.keys(tree.상하위법 as object).length > 0) {
        out.text += "[상하위법]\n";
        formatTree(tree.상하위법, 1, out);
      }

      // 관련법령 트리
      if (
        tree.관련법령 &&
        typeof tree.관련법령 === "object" &&
        Object.keys(tree.관련법령 as object).length > 0
      ) {
        out.text += "\n[관련법령]\n";
        formatTree(tree.관련법령, 1, out);
      }

      if (out.text.trim() === "") {
        text += "(상하위법·관련법령 데이터 없음)\n";
      } else {
        text += out.text;
      }

      const suggestions: Array<{
        tool: string;
        args: Record<string, unknown>;
        reason: string;
      }> = [
        {
          tool: "get_related_laws",
          args: args.mst ? { mst: args.mst } : { lawId: args.lawId ?? "" },
          reason: `${baseName} 평탄 list 형태 (검색·발견용)`,
        },
      ];
      if (baseInfo.법령ID) {
        suggestions.push({
          tool: "get_delegated_laws",
          args: { lawId: baseInfo.법령ID },
          reason: "위임조문 매핑 (조문 수준 세부)",
        });
      }
      text = appendSuggestions(text, suggestions);
      text += `\n${formatLawAttribution(baseName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_law_system_tree");
    }
  },
};
