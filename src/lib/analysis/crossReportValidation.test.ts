import { describe, it, expect } from "vitest";
import type {
  CustomerItemDetailRecord,
  OrgCustomerProfitRecord,
  HqCustomerItemProfitRecord,
} from "@/types";
import {
  calcCrossReportValidation,
  classifyDifferenceLevel,
  getDiffLevelLabel,
} from "./crossReportValidation";

function make100(cust: string, item: string, sales: number, profit: number): CustomerItemDetailRecord {
  return {
    No: 1, 영업조직팀: "팀1", 영업담당사번: "E1",
    매출거래처: cust, 매출거래처명: `고객-${cust}`,
    품목: item, 품목명: `품목-${item}`,
    거래처대분류: "", 거래처중분류: "", 거래처소분류: "",
    제품군: "", 매출연월: "202506", 계정구분: "제품", 매출유형: "일반매출",
    품목군: "", 중분류코드: "", 공장: "",
    제품내수매출: { 계획: 0, 실적: 0, 차이: 0 },
    제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },
    매출수량: { 계획: 0, 실적: 0, 차이: 0 },
    환산수량: { 계획: 0, 실적: 0, 차이: 0 },
    매출액: { 계획: 0, 실적: sales, 차이: 0 },
    실적매출원가: { 계획: 0, 실적: 0, 차이: 0 },
    상품매입: { 계획: 0, 실적: 0, 차이: 0 },
    매출총이익: { 계획: 0, 실적: 0, 차이: 0 },
    판매관리비: { 계획: 0, 실적: 0, 차이: 0 },
    판관변동_직접판매운반비: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익: { 계획: 0, 실적: profit, 차이: 0 },
    매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익율: { 계획: 0, 실적: 0, 차이: 0 },
  };
}

function make304(cust: string, item: string, sales: number, profit: number): HqCustomerItemProfitRecord {
  return {
    No: 1, 영업조직팀: "팀1",
    매출거래처: cust, 매출거래처명: `고객-${cust}`,
    품목: item, 품목명: `품목-${item}`,
    매출수량: { 계획: 0, 실적: 0, 차이: 0 },
    매출액: { 계획: 0, 실적: sales, 차이: 0 },
    실적매출원가: { 계획: 0, 실적: 0, 차이: 0 },
    매출총이익: { 계획: 0, 실적: 0, 차이: 0 },
    판매관리비: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익: { 계획: 0, 실적: profit, 차이: 0 },
    매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익율: { 계획: 0, 실적: 0, 차이: 0 },
  };
}

function make303(cust: string, sales: number, profit: number): OrgCustomerProfitRecord {
  return {
    No: 1, 영업조직팀: "팀1",
    거래처대분류: "", 거래처중분류: "", 거래처소분류: "",
    매출거래처: cust, 매출거래처명: `고객-${cust}`,
    매출액: { 계획: 0, 실적: sales, 차이: 0 },
    실적매출원가: { 계획: 0, 실적: 0, 차이: 0 },
    매출총이익: { 계획: 0, 실적: 0, 차이: 0 },
    판매관리비: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익: { 계획: 0, 실적: profit, 차이: 0 },
    매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익율: { 계획: 0, 실적: 0, 차이: 0 },
  };
}

describe("classifyDifferenceLevel", () => {
  it("0~5% → match", () => {
    expect(classifyDifferenceLevel(0)).toBe("match");
    expect(classifyDifferenceLevel(0.04)).toBe("match");
  });
  it("5~20% → minor", () => {
    expect(classifyDifferenceLevel(0.05)).toBe("minor");
    expect(classifyDifferenceLevel(0.19)).toBe("minor");
  });
  it("20~100% → significant", () => {
    expect(classifyDifferenceLevel(0.2)).toBe("significant");
    expect(classifyDifferenceLevel(0.99)).toBe("significant");
  });
  it("≥100% (누락 등) → critical", () => {
    expect(classifyDifferenceLevel(1.0)).toBe("critical");
    expect(classifyDifferenceLevel(2.5)).toBe("critical");
  });
});

describe("calcCrossReportValidation — 정확 일치", () => {
  it("100/304/303 모두 동일 값 → discrepancy 0건", () => {
    const data100 = [make100("C1", "P1", 10000, 1000)];
    const data304 = [make304("C1", "P1", 10000, 1000)];
    const data303 = [make303("C1", 10000, 1000)];
    const r = calcCrossReportValidation(data100, data303, data304);
    expect(r.pair_100_vs_304).toHaveLength(0);
    expect(r.pair_100_vs_303).toHaveLength(0);
    expect(r.summary.matched_100_304).toBe(1);
    expect(r.summary.matched_100_303).toBe(1);
    expect(r.summary.significantDiffCount).toBe(0);
  });

  it("4% 이내 차이 → match (제외)", () => {
    const data100 = [make100("C1", "P1", 10000, 1000)];
    const data304 = [make304("C1", "P1", 10300, 1020)]; // 3% diff
    const r = calcCrossReportValidation(data100, [], data304);
    expect(r.pair_100_vs_304).toHaveLength(0);
    expect(r.summary.matched_100_304).toBe(1);
  });
});

describe("calcCrossReportValidation — 차이 식별", () => {
  it("100 vs 304 매출 10% 차이 → minor 분류", () => {
    const data100 = [make100("C1", "P1", 10000, 1000)];
    const data304 = [make304("C1", "P1", 11000, 1000)]; // 매출 +10%
    const r = calcCrossReportValidation(data100, [], data304);
    expect(r.pair_100_vs_304).toHaveLength(1);
    const d = r.pair_100_vs_304[0];
    expect(d.level).toBe("minor");
    expect(d.salesDiffRate).toBeCloseTo(1000 / 11000, 2); // |a-b|/max
    expect(d.salesDiff).toBe(-1000); // 100이 작음
  });

  it("100 vs 303 영업이익 50% 차이 → significant", () => {
    const data100 = [make100("C1", "P1", 10000, 1000)];
    const data303 = [make303("C1", 10000, 500)]; // 이익 50% 차이
    const r = calcCrossReportValidation(data100, data303, []);
    expect(r.pair_100_vs_303).toHaveLength(1);
    expect(r.pair_100_vs_303[0].level).toBe("significant");
    expect(r.summary.significantDiffCount).toBe(1);
  });

  it("매출 거의 100% 차이 (양쪽 존재, 한쪽 미세값) → significant", () => {
    const data100 = [make100("C1", "P1", 10000, 0)];
    const data304 = [make304("C1", "P1", 0.0001, 0)]; // 거의 0이나 양쪽 존재
    const r = calcCrossReportValidation(data100, [], data304);
    // 양쪽 존재 (presence=both)이므로 rate < 1.0 → significant
    // critical은 누락 (presence=only_*)일 때만
    expect(r.pair_100_vs_304[0].level).toBe("significant");
    expect(r.summary.significantDiffCount).toBe(1);
  });
});

describe("calcCrossReportValidation — 누락 케이스", () => {
  it("100에만 존재 → only_100 + critical", () => {
    const data100 = [make100("C1", "P1", 10000, 1000)];
    const r = calcCrossReportValidation(data100, [], []);
    expect(r.pair_100_vs_304).toHaveLength(1);
    expect(r.pair_100_vs_304[0].presence).toBe("only_100");
    expect(r.pair_100_vs_304[0].level).toBe("critical");
    expect(r.summary.onlyIn100Count).toBeGreaterThanOrEqual(1);
  });

  it("304에만 존재 → only_other + critical", () => {
    const data304 = [make304("C1", "P1", 5000, 200)];
    const r = calcCrossReportValidation([], [], data304);
    expect(r.pair_100_vs_304).toHaveLength(1);
    expect(r.pair_100_vs_304[0].presence).toBe("only_other");
    expect(r.pair_100_vs_304[0].sales100).toBe(0);
    expect(r.pair_100_vs_304[0].salesOther).toBe(5000);
    expect(r.summary.onlyInOtherCount).toBeGreaterThanOrEqual(1);
  });

  it("0매출 only_100 → 카운트 안 함 (의미 없는 차이)", () => {
    const data100 = [make100("C1", "P1", 0, 0)];
    const r = calcCrossReportValidation(data100, [], []);
    expect(r.pair_100_vs_304).toHaveLength(0);
  });
});

describe("calcCrossReportValidation — 정렬 + 통계", () => {
  it("salesDiffRate 내림차순 정렬", () => {
    const data100 = [
      make100("C1", "P1", 10000, 0),
      make100("C2", "P2", 10000, 0),
    ];
    const data304 = [
      make304("C1", "P1", 5000, 0),  // 50% diff
      make304("C2", "P2", 9000, 0),  // 10% diff
    ];
    const r = calcCrossReportValidation(data100, [], data304);
    expect(r.pair_100_vs_304[0].customerCode).toBe("C1"); // 50% 먼저
    expect(r.pair_100_vs_304[1].customerCode).toBe("C2"); // 10% 다음
  });

  it("100 보고서 다중 row → 거래처+품목 단위 합산 후 비교", () => {
    const data100 = [
      make100("C1", "P1", 5000, 500),
      make100("C1", "P1", 5000, 500),  // 합 10000 / 1000
    ];
    const data304 = [make304("C1", "P1", 10000, 1000)];
    const r = calcCrossReportValidation(data100, [], data304);
    expect(r.pair_100_vs_304).toHaveLength(0); // 합산 후 일치
    expect(r.summary.matched_100_304).toBe(1);
  });

  it("DiffLevel 한국어 라벨 포함", () => {
    expect(getDiffLevelLabel("minor")).toContain("경미");
    expect(getDiffLevelLabel("significant")).toContain("유의");
    expect(getDiffLevelLabel("critical")).toContain("심각");
  });
});
