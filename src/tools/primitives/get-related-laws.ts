import { z } from "zod";
import type { Tool } from "../types.js";
import { notFoundResponse } from "../../lib/not-found.js";
import { formatToolError, ValidationError } from "../../lib/errors.js";
import { appendSuggestions } from "../../lib/suggestions.js";
import { formatLawAttribution } from "../../lib/external-links.js";

const inputSchema = z
  .object({
    mst: z
      .string()
      .optional()
      .describe("법령일련번호 (search_law 결과의 [브래킷] 안 숫자, 권장)"),
    lawId: z.string().optional().describe("법령ID (search_law 결과의 lawId 필드)"),
  })
  .refine((d) => d.mst || d.lawId, {
    message: "mst 또는 lawId 중 하나는 필수입니다",
  });

interface RelatedLawItem {
  type: string; // "법률" | "시행령" | "시행규칙" | "고시" | "훈령" | "예규" | "관련법령" 등
  name: string;
  id: string;
  mst: string;
  effectiveDate?: string;
}

interface SystemTreeResponse {
  법령체계도?: {
    기본정보?: {
      법령명?: string;
      법령ID?: string;
      법령일련번호?: string;
    };
    상하위법?: unknown;
    관련법령?: unknown;
  };
}

export const getRelatedLaws: Tool<typeof inputSchema> = {
  name: "get_related_laws",
  description:
    "관련 법령·하위 행정규칙 조회 (법제처 lawService · target=lsStmd, 법령 체계도). " +
    "본법 → 시행령 → 시행규칙 → 고시·훈령·예규의 상하위 관계와 직접 매핑된 관련법령을 반환. " +
    "PIPC가 결합법령으로 지정한 관계 외에 법제처 자체 매핑도 포함. mst(권장) 또는 lawId 필요. " +
    "다음: get_law_text(lawId·mst)로 본문, search_admin_rule(W2)로 PIPC 고시 본문.",
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
        parsed = JSON.parse(jsonText) as SystemTreeResponse;
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

      const items: RelatedLawItem[] = [];
      collectInfos(tree.상하위법, "", items);
      collectInfos(tree.관련법령, "관련법령", items);

      // 본법 자체 제거 (체계도에 자기 자신이 포함될 수 있음)
      const filtered = items.filter(
        (i) => i.id !== baseInfo.법령ID && i.mst !== baseInfo.법령일련번호
      );

      if (filtered.length === 0) {
        return notFoundResponse(`관련 법령·하위 규칙 없음: ${baseName}`, [
          `intelligent_law_search(query="${baseName}") — 키워드로 관련 조문 검색`,
        ]);
      }

      let text = `관련 법령·하위 규칙 — ${baseName}\n`;
      text += `총 ${filtered.length}건 (시행령·시행규칙·행정규칙·관련법령)\n\n`;

      // type별 그룹핑
      const grouped = new Map<string, RelatedLawItem[]>();
      for (const item of filtered) {
        const list = grouped.get(item.type) ?? [];
        list.push(item);
        grouped.set(item.type, list);
      }

      for (const [type, list] of grouped) {
        text += `[${type}] ${list.length}건\n`;
        for (const item of list) {
          text += `  - ${item.name}`;
          if (item.id) text += ` (ID: ${item.id})`;
          if (item.effectiveDate) text += ` · 시행 ${item.effectiveDate}`;
          text += "\n";
        }
        text += "\n";
      }

      const firstItem = filtered[0];
      if (firstItem) {
        text = appendSuggestions(text, [
          {
            tool: "get_law_text",
            args: firstItem.mst ? { mst: firstItem.mst } : { lawId: firstItem.id },
            reason: `${firstItem.name} 본문 조회`,
          },
        ]);
      }
      text += `\n${formatLawAttribution(baseName)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return formatToolError(err, "get_related_laws");
    }
  },
};

/**
 * 법령 체계도 JSON에서 모든 기본정보 노드를 평탄화 수집.
 * 트리 구조: { type: { subkey: { 기본정보: {...} } | [...] } }
 * parentKey가 type으로 분류됨 (법률/시행령/시행규칙/행정규칙/고시/훈령/예규/...).
 */
function collectInfos(node: unknown, parentKey: string, out: RelatedLawItem[]): void {
  if (!node || typeof node !== "object") return;

  // 배열이면 각 요소를 동일 parentKey로 재귀
  if (Array.isArray(node)) {
    for (const item of node) collectInfos(item, parentKey, out);
    return;
  }

  const obj = node as Record<string, unknown>;

  // 이 노드 자체에 기본정보가 있으면 항목으로 추가
  if (obj.기본정보 && typeof obj.기본정보 === "object") {
    addInfo(obj.기본정보, parentKey || "기타", out);
  }

  // 다른 자식 노드도 walk
  for (const [key, value] of Object.entries(obj)) {
    if (key === "기본정보") continue;
    collectInfos(value, key, out);
  }
}

function addInfo(info: unknown, type: string, out: RelatedLawItem[]): void {
  if (!info || typeof info !== "object") return;
  const i = info as Record<string, unknown>;

  const name =
    typeof i.법령명 === "string"
      ? i.법령명
      : typeof i.행정규칙명 === "string"
        ? i.행정규칙명
        : null;
  if (!name) return; // 기본정보 노드가 아닌 다른 객체일 수 있음

  out.push({
    type,
    name,
    id: typeof i.법령ID === "string" ? i.법령ID : typeof i.행정규칙ID === "string" ? i.행정규칙ID : "",
    mst:
      typeof i.법령일련번호 === "string"
        ? i.법령일련번호
        : typeof i.행정규칙일련번호 === "string"
          ? i.행정규칙일련번호
          : "",
    effectiveDate: typeof i.시행일자 === "string" ? i.시행일자 : undefined,
  });
}
