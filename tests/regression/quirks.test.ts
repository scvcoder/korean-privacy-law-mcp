/**
 * Regression: 발견·수정한 quirk가 다시 나오면 잡혀야 함.
 *
 * 1. CDATA wrapper leak — 모든 search/text 도구가 `<![CDATA[...]]>` 그대로 출력하던 latent bug.
 *    `extractTag`/`extractTagAll`에 unwrapCdata 추가로 수정.
 * 2. Case-sensitive XML — `<Ppc>...<ppc>...</ppc>...</Ppc>` 처럼 outer/inner 태그가
 *    케이스만 다른 채 공존. case-insensitive 매칭 시 outer가 inner의 닫는 태그에 잘림.
 *    extractTag에서 `/i` 플래그 제거하고 case-sensitive로 수정.
 * 3. PIPC decision 본문 root key — `PpcService.의결서` 중첩 quirk.
 * 4. Decision (decc) root — `PrecService` (DeccService 아님) quirk.
 */

import { describe, it, expect } from "vitest";
import { LawApiClient } from "../../src/client/law-api-client.js";
import { loadEnv } from "../../src/lib/env.js";
import { searchLaw } from "../../src/tools/primitives/search-law.js";
import { searchPipcDecisions } from "../../src/tools/primitives/search-pipc-decisions.js";
import { searchAdminAppeals } from "../../src/tools/primitives/search-admin-appeals.js";
import { getLawHistory } from "../../src/tools/primitives/get-law-history.js";
import { getLawText } from "../../src/tools/primitives/get-law-text.js";
import {
  extractTag,
  extractTagAll,
  parseSearchXML,
} from "../../src/client/xml-parse.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("CDATA unwrap — extractTag·extractTagAll 단위", () => {
  it("CDATA 래퍼 자동 제거", () => {
    const xml = "<title><![CDATA[개인정보 보호법]]></title>";
    expect(extractTag(xml, "title")).toBe("개인정보 보호법");
  });

  it("CDATA 없는 일반 텍스트는 그대로", () => {
    const xml = "<title>개인정보 보호법</title>";
    expect(extractTag(xml, "title")).toBe("개인정보 보호법");
  });

  it("extractTagAll 다중 항목도 unwrap", () => {
    const xml =
      "<root><item><![CDATA[A법]]></item><item><![CDATA[B법]]></item></root>";
    expect(extractTagAll(xml, "item")).toEqual(["A법", "B법"]);
  });

  it("CDATA 안의 특수문자 보존", () => {
    const xml = "<title><![CDATA[개정·신설 <2020.2.4>]]></title>";
    expect(extractTag(xml, "title")).toBe("개정·신설 <2020.2.4>");
  });

  it("닫는 ]]> 패턴이 본문 안에 우연히 있어도 정확히 unwrap", () => {
    // CDATA 본문에 ']]'가 들어가지 않는 한 정상 (XML 표준)
    const xml = "<title><![CDATA[정보보호 등에 관한 법률]]></title>";
    expect(extractTag(xml, "title")).toBe("정보보호 등에 관한 법률");
  });
});

describe("case-sensitive XML — Ppc/ppc 충돌 회피", () => {
  it("대소문자 다른 outer/inner 태그 정확 분리", () => {
    const xml = "<Ppc><id>1</id><ppc>내부</ppc></Ppc>";
    // outer Ppc 추출 시 inner ppc 닫는 태그에 잘리지 않아야 함
    const outer = extractTag(xml, "Ppc");
    expect(outer).toContain("<id>1</id>");
    expect(outer).toContain("<ppc>내부</ppc>");
  });

  it("소문자 태그만 추출 (case-sensitive)", () => {
    const xml = "<Ppc><id>1</id><ppc>내부</ppc></Ppc>";
    // 소문자 ppc만 매칭 — outer 'Ppc'와 다름
    const inner = extractTag(xml, "ppc");
    expect(inner).toBe("내부");
  });

  it("parseSearchXML도 case-sensitive 동작", () => {
    const xml =
      "<Ppc><totalCnt>2</totalCnt><page>1</page><ppc><id>A</id></ppc><ppc><id>B</id></ppc></Ppc>";
    const result = parseSearchXML(
      xml,
      "Ppc",
      "ppc",
      (item) => ({ id: extractTag(item, "id") })
    );
    expect(result.totalCnt).toBe(2);
    expect(result.items.map((i) => i.id)).toEqual(["A", "B"]);
  });

  it("Decc/decc도 동일 패턴 (행정심판)", () => {
    const xml = "<Decc><decc><id>X</id></decc></Decc>";
    const inner = extractTag(xml, "decc");
    expect(inner).toBe("<id>X</id>");
  });

  it("안전한 태그명 검증 — 특수문자 거부", () => {
    expect(extractTag("<x>1</x>", "x[evil]")).toBe("");
    expect(extractTagAll("<x>1</x>", "x[evil]")).toEqual([]);
  });
});

describe.skipIf(!hasApiKey)("실 API 응답 — CDATA 래퍼 잔존 회귀 검증", () => {
  const client = new LawApiClient();

  it("search_law 응답에 [CDATA[ 잔존 X", async () => {
    const r = await searchLaw.handler(
      searchLaw.inputSchema.parse({ query: "개인정보 보호법" }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).not.toContain("[CDATA[");
    expect(text).not.toContain("]]>");
  }, 30_000);

  it("get_law_text 응답에 [CDATA[ 잔존 X", async () => {
    const r = await getLawText.handler(
      getLawText.inputSchema.parse({ mst: "270351" }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).not.toContain("[CDATA[");
    expect(text).not.toContain("]]>");
  }, 30_000);

  it("get_law_history 응답에 [CDATA[ 잔존 X", async () => {
    const r = await getLawHistory.handler(
      getLawHistory.inputSchema.parse({ lawName: "개인정보 보호법" }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).not.toContain("[CDATA[");
  }, 30_000);

  it("search_pipc_decisions 응답에 case-sensitive XML 정상 파싱", async () => {
    const r = await searchPipcDecisions.handler(
      searchPipcDecisions.inputSchema.parse({ query: "개인정보" }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).not.toContain("[CDATA[");
    // 케이스 충돌 시 [id=] 또는 mst 정상 추출 (잘리면 빈 값)
    expect(text).toMatch(/\[id=\d+\]/);
  }, 30_000);

  it("search_admin_appeals 응답도 case-sensitive 정상", async () => {
    const r = await searchAdminAppeals.handler(
      searchAdminAppeals.inputSchema.parse({ query: "개인정보" }),
      client
    );
    const text = r.content[0]?.text ?? "";
    expect(text).not.toContain("[CDATA[");
    expect(text).toMatch(/\[id=\d+\]/);
  }, 30_000);
});

describe("XML quirks — 특수 입력 정상 처리", () => {
  it("빈 태그 — extractTag returns empty string", () => {
    expect(extractTag("<x></x>", "x")).toBe("");
  });

  it("self-closing 태그 — 매칭 실패", () => {
    expect(extractTag("<x/>", "x")).toBe("");
  });

  it("속성 있는 태그 — 본문 추출", () => {
    expect(extractTag('<x id="1">A</x>', "x")).toBe("A");
  });

  it("중첩 같은 태그 — 첫 매칭만 반환", () => {
    expect(extractTag("<x>A<x>B</x></x>", "x")).toBe("A<x>B");
  });

  it("CDATA 안에 같은 태그명이 있어도 그대로 unwrap", () => {
    const xml = "<title><![CDATA[<title>중첩</title>]]></title>";
    // outer title 매칭 — inner는 CDATA 안에 있어 영향 없음
    const result = extractTag(xml, "title");
    // 첫 매칭은 CDATA wrapper까지 잡고 unwrapCdata 적용
    expect(result).toContain("중첩");
  });
});
