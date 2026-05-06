import { describe, it, expect } from "vitest";
import {
  extractTag,
  extractTagAll,
  parseSearchXML,
  parseXML,
  asArray,
} from "../../src/client/xml-parse.js";

describe("extractTag", () => {
  it("기본 태그 추출", () => {
    const xml = "<root><name>홍길동</name></root>";
    expect(extractTag(xml, "name")).toBe("홍길동");
  });

  it("속성이 있어도 추출", () => {
    const xml = '<item id="1">값</item>';
    expect(extractTag(xml, "item")).toBe("값");
  });

  it("멀티라인 본문 추출 (개행 보존 후 trim)", () => {
    const xml = `<body>
첫 줄
둘째 줄
</body>`;
    expect(extractTag(xml, "body")).toContain("첫 줄");
    expect(extractTag(xml, "body")).toContain("둘째 줄");
  });

  it("매칭 없으면 빈 문자열", () => {
    expect(extractTag("<x/>", "y")).toBe("");
  });

  it("한글 태그명 지원", () => {
    const xml = "<법령일련번호>12345</법령일련번호>";
    expect(extractTag(xml, "법령일련번호")).toBe("12345");
  });

  it("부정 정규식 주입 방어", () => {
    expect(extractTag("<a>x</a>", "a.*")).toBe("");
    expect(extractTag("<a>x</a>", "a|b")).toBe("");
  });

  it("CDATA wrapper 자동 제거 — 법제처 XML 핵심 quirk", () => {
    expect(extractTag("<x><![CDATA[hello world]]></x>", "x")).toBe("hello world");
    expect(extractTag("<법령명한글><![CDATA[개인정보 보호법]]></법령명한글>", "법령명한글")).toBe("개인정보 보호법");
  });

  it("CDATA 없는 일반 텍스트는 그대로", () => {
    expect(extractTag("<x>plain text</x>", "x")).toBe("plain text");
  });

  it("extractTagAll도 CDATA 자동 제거", () => {
    const xml = "<r><x><![CDATA[a]]></x><x><![CDATA[b]]></x></r>";
    expect(extractTagAll(xml, "x")).toEqual(["a", "b"]);
  });
});

describe("extractTagAll", () => {
  it("같은 태그 N개 모두 반환", () => {
    const xml = "<r><x>a</x><x>b</x><x>c</x></r>";
    expect(extractTagAll(xml, "x")).toEqual(["a", "b", "c"]);
  });

  it("매칭 없으면 빈 배열", () => {
    expect(extractTagAll("<r/>", "z")).toEqual([]);
  });
});

describe("parseSearchXML", () => {
  it("법제처 검색 응답 형식 파싱", () => {
    const xml = `<LawSearch>
      <totalCnt>2</totalCnt>
      <page>1</page>
      <law>
        <법령일련번호>1</법령일련번호>
        <법령명한글>개인정보 보호법</법령명한글>
      </law>
      <law>
        <법령일련번호>2</법령일련번호>
        <법령명한글>의료법</법령명한글>
      </law>
    </LawSearch>`;

    const result = parseSearchXML(xml, "LawSearch", "law", (item) => ({
      id: extractTag(item, "법령일련번호"),
      name: extractTag(item, "법령명한글"),
    }));

    expect(result.totalCnt).toBe(2);
    expect(result.page).toBe(1);
    expect(result.items).toEqual([
      { id: "1", name: "개인정보 보호법" },
      { id: "2", name: "의료법" },
    ]);
  });

  it("totalCnt 0 빈 결과", () => {
    const xml = "<LawSearch><totalCnt>0</totalCnt><page>1</page></LawSearch>";
    const result = parseSearchXML(xml, "LawSearch", "law", () => ({}));
    expect(result.totalCnt).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("totalCnt·page 누락 시 기본값", () => {
    const xml = "<LawSearch><law><x>v</x></law></LawSearch>";
    const result = parseSearchXML(xml, "LawSearch", "law", (item) => extractTag(item, "x"));
    expect(result.totalCnt).toBe(0);
    expect(result.page).toBe(1);
    expect(result.items).toEqual(["v"]);
  });
});

describe("parseXML (fast-xml-parser)", () => {
  it("중첩 구조 파싱", () => {
    const xml = "<root><a>1</a><b><c>2</c></b></root>";
    const obj = parseXML(xml) as { root: { a: string; b: { c: string } } };
    expect(obj.root.a).toBe("1");
    expect(obj.root.b.c).toBe("2");
  });
});

describe("asArray", () => {
  it("undefined → []", () => {
    expect(asArray(undefined)).toEqual([]);
  });
  it("null → []", () => {
    expect(asArray(null)).toEqual([]);
  });
  it("단일 객체 → [객체]", () => {
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
  });
  it("배열은 그대로", () => {
    expect(asArray([1, 2, 3])).toEqual([1, 2, 3]);
  });
});
