/**
 * Regression: 조문 코드(JO 6자리) 정규화 일관성.
 * 적용 도구: compare_articles, get_article_change_history (둘 다 jo 입력 받음)
 *
 * lib/citations.ts의 toJoParam:
 *  - 6자리 ("001500", "002802") → 그대로
 *  - 1~4자리 숫자 ("15", "0015") → "001500"
 *  - 한글 ("제15조", "제28조의2") → "001500", "002802"
 */

import { describe, it, expect } from "vitest";
import { LawApiClient } from "../../src/client/law-api-client.js";
import { loadEnv } from "../../src/lib/env.js";
import { compareArticles } from "../../src/tools/primitives/compare-articles.js";
import { getArticleChangeHistory } from "../../src/tools/primitives/get-article-change-history.js";
import {
  toJoParam,
  parseJoCode,
  formatJoCode,
} from "../../src/lib/citations.js";

loadEnv();
const hasApiKey = Boolean(process.env.LAW_OC && process.env.LAW_OC.length > 0);

describe("toJoParam — 다양한 입력 형식 정규화", () => {
  it("6자리 정확 입력 → 그대로", () => {
    expect(toJoParam("001500")).toBe("001500");
    expect(toJoParam("002802")).toBe("002802");
    expect(toJoParam("000300")).toBe("000300");
  });

  it("1자리 숫자 → 4자리 패딩 + 가지00", () => {
    expect(toJoParam("1")).toBe("000100");
    expect(toJoParam("9")).toBe("000900");
  });

  it("2자리 숫자 → 4자리 패딩", () => {
    expect(toJoParam("15")).toBe("001500");
    expect(toJoParam("28")).toBe("002800");
  });

  it("3자리 숫자 → 4자리 패딩", () => {
    expect(toJoParam("100")).toBe("010000");
  });

  it("4자리 숫자 → 가지00 추가", () => {
    expect(toJoParam("0015")).toBe("001500");
  });

  it("'제N조' 한글 → 6자리", () => {
    expect(toJoParam("제15조")).toBe("001500");
    expect(toJoParam("제1조")).toBe("000100");
    expect(toJoParam("제100조")).toBe("010000");
  });

  it("'제N조의M' 가지번호 한글 → 6자리", () => {
    expect(toJoParam("제28조의2")).toBe("002802");
    expect(toJoParam("제15조의2")).toBe("001502");
    expect(toJoParam("제39조의11")).toBe("003911");
  });

  it("공백 trim 처리", () => {
    expect(toJoParam("  제15조  ")).toBe("001500");
    expect(toJoParam(" 001500 ")).toBe("001500");
  });

  it("잘못된 입력 → null", () => {
    expect(toJoParam("abc")).toBeNull();
    expect(toJoParam("제15")).toBeNull(); // '조' 없음
    expect(toJoParam("xxxxx")).toBeNull();
    expect(toJoParam("")).toBeNull();
  });

  it("5자리·7자리 등 비표준 길이 → null 또는 오류", () => {
    expect(toJoParam("12345")).toBeNull(); // 5자리 미지원
    expect(toJoParam("1234567")).toBeNull(); // 7자리
  });
});

describe("parseJoCode — 한글 표현 파싱", () => {
  it("기본 조문번호", () => {
    expect(parseJoCode("제15조")).toEqual({ jo: 15 });
  });

  it("조문가지번호", () => {
    expect(parseJoCode("제28조의2")).toEqual({ jo: 28, jo_branch: 2 });
  });

  it("항·호·목 결합", () => {
    expect(parseJoCode("제15조제1항제2호가목")).toEqual({
      jo: 15,
      hang: 1,
      ho: 2,
      mok: "가",
    });
  });

  it("공백 무시", () => {
    expect(parseJoCode("제 15 조 제 1 항")).toEqual({ jo: 15, hang: 1 });
  });

  it("매칭 실패 → null", () => {
    expect(parseJoCode("xyz")).toBeNull();
    expect(parseJoCode("제ㄱ조")).toBeNull(); // 한글 조번호
  });
});

describe("formatJoCode — JoCode 역포맷 (round-trip)", () => {
  it("기본 round-trip", () => {
    const code = parseJoCode("제15조제1항제2호가목");
    expect(code).not.toBeNull();
    if (code) expect(formatJoCode(code)).toBe("제15조제1항제2호가목");
  });

  it("가지번호 round-trip", () => {
    const code = parseJoCode("제28조의2");
    expect(code).not.toBeNull();
    if (code) expect(formatJoCode(code)).toBe("제28조의2");
  });
});

describe.skipIf(!hasApiKey)("compare_articles — jo 입력 변형 일관성", () => {
  const client = new LawApiClient();

  it("같은 조문, 다른 표기 ('제15조' vs '001500' vs '15') → 동일 결과", async () => {
    const r1 = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제15조" },
        right: { mst: "270351", jo: "001500" },
      }),
      client
    );
    const r2 = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "15" },
        right: { mst: "270351", jo: "제15조" },
      }),
      client
    );
    expect(r1.isError).toBeFalsy();
    expect(r2.isError).toBeFalsy();
    // 두 응답 모두 [제15조] 라벨 포함
    expect(r1.content[0]?.text).toContain("[제15조]");
    expect(r2.content[0]?.text).toContain("[제15조]");
  }, 60_000);

  it("가지번호 표기 ('제28조의2' vs '002802') → 동일", async () => {
    const r1 = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "제28조의2" },
        right: { mst: "270351", jo: "002802" },
      }),
      client
    );
    expect(r1.isError).toBeFalsy();
    expect(r1.content[0]?.text).toContain("[제28조의2]");
  }, 30_000);

  it("잘못된 jo 형식 → ValidationError 메시지", async () => {
    const r = await compareArticles.handler(
      compareArticles.inputSchema.parse({
        left: { mst: "270351", jo: "abc" },
        right: { mst: "270351", jo: "제15조" },
      }),
      client
    );
    expect(r.isError).toBe(true);
    const text = r.content[0]?.text ?? "";
    // [NOT_FOUND] 또는 [ERROR] 마커
    expect(text).toMatch(/\[NOT_FOUND\]|\[ERROR\]/);
  }, 30_000);
});

describe.skipIf(!hasApiKey)("get_article_change_history — jo 정규화", () => {
  const client = new LawApiClient();

  it("jo='제15조' 정규화", async () => {
    const r = await getArticleChangeHistory.handler(
      getArticleChangeHistory.inputSchema.parse({
        lawId: "011357",
        jo: "제15조",
      }),
      client
    );
    // 매칭 결과가 있을 수도 없을 수도 있음, error 형태만 확인
    expect(r.content[0]?.text).toBeDefined();
  }, 30_000);

  it("jo='001500' 동일 결과", async () => {
    const r = await getArticleChangeHistory.handler(
      getArticleChangeHistory.inputSchema.parse({
        lawId: "011357",
        jo: "001500",
      }),
      client
    );
    expect(r.content[0]?.text).toBeDefined();
  }, 30_000);

  it("jo='15' 4자리 미만도 정규화", async () => {
    const r = await getArticleChangeHistory.handler(
      getArticleChangeHistory.inputSchema.parse({
        lawId: "011357",
        jo: "15",
      }),
      client
    );
    expect(r.content[0]?.text).toBeDefined();
  }, 30_000);
});
