import { describe, it, expect } from "vitest";
import type { ReceivableAgingRecord } from "@/types";
import {
  buildCustomerMasterMap,
  lookupCustomerCode,
  lookupCustomerName,
  normalizeCustomerName,
} from "./customerMasterMap";

// ─── 헬퍼 ────────────────────────────────────────────

function aging(code: string, name: string, office = "건자재"): ReceivableAgingRecord {
  return {
    No: 1,
    영업조직: "건자재팀",
    담당자: "김민식",
    판매처: code,
    판매처명: name,
    통화: "KRW",
    month1: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
    month2: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
    month3: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
    month4: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
    month5: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
    month6: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
    overdue: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
    합계: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
    여신한도: 100_000_000,
  };
}

// ─── buildCustomerMasterMap ──────────────────────────

describe("buildCustomerMasterMap", () => {
  it("빈 aging → 빈 매핑", () => {
    const m = buildCustomerMasterMap(new Map());
    expect(m.codeToName.size).toBe(0);
    expect(m.nameToCode.size).toBe(0);
  });

  it("단일 거래처 → 양방향 매핑 빌드", () => {
    const agingMap = new Map([
      ["건자재", [aging("C100002775", "리본TS")]],
    ]);
    const m = buildCustomerMasterMap(agingMap);
    expect(m.codeToName.get("C100002775")).toBe("리본TS");
    expect(m.nameToCode.get("리본TS")).toBe("C100002775");
  });

  it("여러 사무소에 동일 거래처 → 첫 번째 등장 우선", () => {
    const agingMap = new Map([
      ["건자재", [aging("C001", "거래처A")]],
      ["광주", [aging("C001", "거래처A 변형")]],
    ]);
    const m = buildCustomerMasterMap(agingMap);
    expect(m.codeToName.get("C001")).toBe("거래처A"); // 첫 번째
  });

  it("정규화 이름 매핑 — 공백 차이 처리", () => {
    const agingMap = new Map([
      ["건자재", [aging("C001", "  거래처   A  ")]],
    ]);
    const m = buildCustomerMasterMap(agingMap);
    expect(m.normalizedNameToCode.get("거래처 A")).toBe("C001");
  });

  it("코드 또는 이름 누락 → 매핑 제외", () => {
    const agingMap = new Map([
      ["건자재", [
        aging("", "이름만"),
        aging("C001", ""),
        aging("C002", "정상"),
      ]],
    ]);
    const m = buildCustomerMasterMap(agingMap);
    expect(m.codeToName.size).toBe(1);
    expect(m.codeToName.get("C002")).toBe("정상");
  });
});

// ─── lookupCustomerCode ──────────────────────────────

describe("lookupCustomerCode", () => {
  const master = buildCustomerMasterMap(new Map([
    ["건자재", [
      aging("C100002775", "리본TS"),
      aging("C100002940", "대성이앤씨 주식회사"),
      aging("C100015638", "일성"),
    ]],
  ]));

  it("Stage 1: 코드 직접 매칭", () => {
    expect(lookupCustomerCode("C100002775", master)).toBe("C100002775");
  });

  it("Stage 2: 정확 이름 매칭", () => {
    expect(lookupCustomerCode("리본TS", master)).toBe("C100002775");
  });

  it("Stage 3: 공백 정규화 매칭", () => {
    expect(lookupCustomerCode("  리본TS  ", master)).toBe("C100002775");
  });

  it("Stage 4 안전 fuzzy: 부분 일치 (대성이앤씨 → 대성이앤씨 주식회사)", () => {
    expect(lookupCustomerCode("대성이앤씨", master)).toBe("C100002940");
  });

  it("Stage 4 안전 fuzzy: 긴 → 짧은 매칭 (대성이앤씨 주식회사 → 대성이앤씨)", () => {
    // 마스터에는 "대성이앤씨 주식회사"가 있고 query는 더 긴 형태
    const m2 = buildCustomerMasterMap(new Map([
      ["건자재", [aging("C001", "대성이앤씨")]],
    ]));
    expect(lookupCustomerCode("대성이앤씨 주식회사", m2)).toBe("C001");
  });

  it("거짓 양성 방지: 짧은 이름 (4자 미만) fuzzy 미적용", () => {
    const m2 = buildCustomerMasterMap(new Map([
      ["건자재", [
        aging("C001", "한일전기"),
        aging("C002", "한일건설"),
      ]],
    ]));
    // "한일" (2자) 검색 → fuzzy 미적용 → null (잘못 매칭 방지)
    expect(lookupCustomerCode("한일", m2)).toBe(null);
  });

  it("거짓 양성 방지: 짧은 마스터 이름 fuzzy 미적용", () => {
    const m2 = buildCustomerMasterMap(new Map([
      ["건자재", [aging("C001", "ABC")]], // 3자
    ]));
    // 마스터 이름이 너무 짧아 fuzzy 불가능 → 정확 매칭만
    expect(lookupCustomerCode("ABC회사", m2)).toBe(null);
    expect(lookupCustomerCode("ABC", m2)).toBe("C001"); // 정확 매칭은 OK
  });

  it("매칭 실패 → null", () => {
    expect(lookupCustomerCode("존재하지않는거래처", master)).toBe(null);
  });

  it("빈 query → null", () => {
    expect(lookupCustomerCode("", master)).toBe(null);
    expect(lookupCustomerCode("   ", master)).toBe(null);
  });
});

// ─── lookupCustomerName ──────────────────────────────

describe("lookupCustomerName", () => {
  const master = buildCustomerMasterMap(new Map([
    ["건자재", [aging("C100002775", "리본TS")]],
  ]));

  it("코드 → 이름 lookup", () => {
    expect(lookupCustomerName("C100002775", master)).toBe("리본TS");
  });

  it("매칭 실패 → null", () => {
    expect(lookupCustomerName("INVALID", master)).toBe(null);
  });
});

// ─── normalizeCustomerName ───────────────────────────

describe("normalizeCustomerName", () => {
  it("trim + 내부 공백 정규화", () => {
    expect(normalizeCustomerName("  거래처   A  ")).toBe("거래처 A");
  });

  it("주식회사 접미사 보존", () => {
    expect(normalizeCustomerName("대성이앤씨 주식회사")).toBe("대성이앤씨 주식회사");
  });

  it("빈 입력", () => {
    expect(normalizeCustomerName("")).toBe("");
  });
});
