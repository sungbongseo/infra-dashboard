import { describe, it, expect } from "vitest";
import {
  calcFactoryEfficiencyMatrix,
  calcStandardCostAccuracyKPI,
  detectInefficiencies,
  calcFactoryStandardCostCoverage,
} from "./costEfficiency";
import type {
  StandardCostBookRecord,
  ManufacturingCostRecord,
  ThreeWayComparisonRow,
} from "@/types";

function makeMfg(factory: string, code: string, name: string, unitCost: number, qty = 100): ManufacturingCostRecord {
  const total = unitCost * qty;
  return {
    factory,
    공장명원본: `${factory}공장`,
    period: "2026-Q1",
    생산품코드: code,
    생산품명: name,
    품목그룹: "제품",
    대분류: "", 중분류: "", 소분류: "", 기준단위: "KG",
    생산입고수량: qty, 환산수량: qty,
    원재료비: total * 0.6, 부재료비: 0, 상품매입: 0, 노무비: total * 0.2,
    복리후생비: 0, 소모품비: 0, 수도광열비: 0, 수선비: 0, 연료비: 0,
    외주가공비: 0, 운반비: 0, 전력비: 0, 지급수수료: 0, 견본비: 0,
    고정노무비: total * 0.2, 감가상각비: 0, 기타경비: 0,
    totalVariableCost: total * 0.8, totalFixedCost: total * 0.2,
    actualUnitCost: unitCost, bomLineCount: 2,
  };
}

function makeStd(factory: string, code: string, name: string, cost: number, 계정 = "제품"): StandardCostBookRecord {
  return {
    factory, 품목코드: code, 품목명: name, 품목계정그룹: 계정,
    기본단위: "KG", 규격: "", 표준원가: cost,
    유효시작: "", 유효종료: "",
  };
}

function makeThreeWay(factory: string, stdCost: number, actualCost: number, salesAmount: number): ThreeWayComparisonRow {
  const qty = 100;
  return {
    itemCode: `C${factory}`, itemName: `품목${factory}`, factory,
    salesQty: qty, salesAmount,
    avgSalesPrice: salesAmount / qty,
    standardCost: stdCost, hasStandard: true, standardCostFactory: factory,
    actualUnitCost: actualCost, hasManufacturing: true, actualCostFactory: factory,
    salesVsStdMarginPct: null, salesVsActualMarginPct: null,
    stdVsActualVariancePct: ((actualCost - stdCost) / stdCost) * 100,
    marginVarianceImpact: (actualCost - stdCost) * qty,
    salesImpact: (actualCost - stdCost) * qty,
    note: "",
  };
}

describe("costEfficiency", () => {
  describe("calcFactoryEfficiencyMatrix (A. 공장 효율성)", () => {
    it("다공장 생산 품목 식별 및 스프레드 계산", () => {
      const mfg = [
        makeMfg("양산", "ITEM1", "품목1", 5000, 100),
        makeMfg("청산", "ITEM1", "품목1", 6000, 80),
        makeMfg("양산", "ITEM2", "품목2", 3000, 200), // 단일 공장
      ];
      const std = [
        makeStd("양산", "ITEM1", "품목1", 4800),
        makeStd("청산", "ITEM1", "품목1", 5800),
      ];
      const result = calcFactoryEfficiencyMatrix(mfg, std);
      expect(result.length).toBe(2);
      // 다공장 생산이 앞에 정렬됨
      expect(result[0].itemCode).toBe("ITEM1");
      expect(result[0].multiFactoryProduced).toBe(true);
      expect(result[0].cheapestFactory).toBe("양산");
      expect(result[0].mostExpensiveFactory).toBe("청산");
      // 스프레드: (6000-5000)/5000 = 20%
      expect(result[0].spreadPct).toBeCloseTo(20, 1);
      expect(result[0].costByFactory["양산"]).toBe(5000);
      expect(result[0].costByFactory["청산"]).toBe(6000);
      expect(result[0].stdCostByFactory["양산"]).toBe(4800);
      // 단일 공장 품목은 뒤쪽
      expect(result[1].multiFactoryProduced).toBe(false);
    });

    it("생산 0인 공장은 제외", () => {
      const mfg = [
        { ...makeMfg("양산", "X", "X", 5000, 100), actualUnitCost: 0 },
        makeMfg("청산", "X", "X", 4000, 50),
      ];
      const result = calcFactoryEfficiencyMatrix(mfg as any, []);
      // 양산은 actualUnitCost가 0이라 제외
      expect(result[0].costByFactory["양산"]).toBeUndefined();
      expect(result[0].multiFactoryProduced).toBe(false);
    });
  });

  describe("calcStandardCostAccuracyKPI (B. 정확도 KPI)", () => {
    it("모든 품목 ±5% 내 → A등급", () => {
      const rows = [
        makeThreeWay("양산", 1000, 1020, 5000000), // +2%
        makeThreeWay("청산", 2000, 1960, 3000000), // -2%
      ];
      const kpi = calcStandardCostAccuracyKPI(rows);
      expect(kpi.grade).toBe("A");
      expect(kpi.within5PctRatio).toBe(1);
      expect(kpi.sampleSize).toBe(2);
    });

    it("20%+ 편차 다수 → C/D 등급", () => {
      const rows = [
        makeThreeWay("양산", 1000, 1300, 5000000), // +30%
        makeThreeWay("청산", 2000, 2500, 3000000), // +25%
      ];
      const kpi = calcStandardCostAccuracyKPI(rows);
      expect(["C", "D"]).toContain(kpi.grade);
      expect(kpi.within5PctRatio).toBe(0);
      expect(kpi.weightedAbsVariancePct).toBeGreaterThan(20);
    });

    it("가중 평균 — 매출 큰 품목이 더 반영", () => {
      const rows = [
        makeThreeWay("양산", 1000, 1100, 9000000), // +10%, 매출 큼
        makeThreeWay("청산", 2000, 1900, 1000000), // -5%, 매출 작음
      ];
      const kpi = calcStandardCostAccuracyKPI(rows);
      // 매출 가중: (10×9M + 5×1M) / 10M = 9.5 (절대값)
      expect(kpi.weightedAbsVariancePct).toBeCloseTo(9.5, 1);
    });

    it("샘플 0 → D등급 + 진단 메시지", () => {
      const kpi = calcStandardCostAccuracyKPI([]);
      expect(kpi.grade).toBe("D");
      expect(kpi.sampleSize).toBe(0);
      expect(kpi.diagnosis).toMatch(/샘플 부족/);
    });

    it("양수 변동률 비중 (overStandardRatio) 계산", () => {
      const rows = [
        makeThreeWay("양산", 1000, 1100, 6000000), // +10%
        makeThreeWay("청산", 2000, 1800, 4000000), // -10%
      ];
      const kpi = calcStandardCostAccuracyKPI(rows);
      // 양수 매출 6M / 전체 10M = 0.6
      expect(kpi.overStandardRatio).toBeCloseTo(0.6, 2);
    });
  });

  describe("calcFactoryStandardCostCoverage (공장별 표준원가 커버리지)", () => {
    it("표준원가 파일이 있는 공장은 커버리지 계산, 없는 공장은 0%", () => {
      const mfg = [
        makeMfg("양산", "A1", "A1", 1000, 10),
        makeMfg("양산", "A2", "A2", 1000, 10),
        makeMfg("청산", "C1", "C1", 1000, 10),
        makeMfg("울산", "U1", "U1", 1000, 10),
        makeMfg("울산", "U2", "U2", 1000, 10),
      ];
      const std = [
        makeStd("양산", "A1", "A1", 900),
        makeStd("양산", "A2", "A2", 900),
        makeStd("청산", "C1", "C1", 900),
        // 울산 표준원가 없음
      ];
      const result = calcFactoryStandardCostCoverage(mfg, std);

      const ys = result.find(r => r.factory === "양산")!;
      expect(ys.manufacturedItems).toBe(2);
      expect(ys.standardRegistered).toBe(2);
      expect(ys.coveragePct).toBe(100);
      expect(ys.status).toBe("complete");

      const cs = result.find(r => r.factory === "청산")!;
      expect(cs.coveragePct).toBe(100);

      const us = result.find(r => r.factory === "울산")!;
      expect(us.manufacturedItems).toBe(2);
      expect(us.standardRegistered).toBe(0);
      expect(us.coveragePct).toBe(0);
      expect(us.status).toBe("missing");
      expect(us.missingItems.length).toBe(2);
    });

    it("부분 커버리지 (일부만 등록) → partial 상태", () => {
      const mfg = [
        makeMfg("양산", "A1", "A1", 1000, 10),
        makeMfg("양산", "A2", "A2", 1000, 10),
        makeMfg("양산", "A3", "A3", 1000, 10),
        makeMfg("양산", "A4", "A4", 1000, 10),
      ];
      const std = [
        makeStd("양산", "A1", "A1", 900),
        makeStd("양산", "A2", "A2", 900),
      ];
      const result = calcFactoryStandardCostCoverage(mfg, std);
      expect(result[0].coveragePct).toBe(50);
      expect(result[0].status).toBe("partial");
      expect(result[0].missingItems.length).toBe(2);
    });

    it("원재료 등 비제품은 커버리지 계산에서 제외", () => {
      const mfg = [makeMfg("양산", "P1", "P1", 1000, 10)];
      const std = [
        makeStd("양산", "P1", "P1", 900, "원재료"), // 원재료는 카운트 안 됨
      ];
      const result = calcFactoryStandardCostCoverage(mfg, std);
      expect(result[0].standardRegistered).toBe(0);
      expect(result[0].status).toBe("missing");
    });
  });

  describe("detectInefficiencies", () => {
    it("공장 간 스프레드 ≥ 10% 알림", () => {
      const mfg = [
        makeMfg("양산", "X", "X", 5000, 100),
        makeMfg("청산", "X", "X", 6000, 80), // +20%
      ];
      const efficiency = calcFactoryEfficiencyMatrix(mfg, []);
      const alerts = detectInefficiencies(efficiency, []);
      expect(alerts.length).toBeGreaterThan(0);
      const spreadAlert = alerts.find((a) => a.alertType === "factory_spread");
      expect(spreadAlert).toBeDefined();
      expect(spreadAlert!.cheapestOption?.factory).toBe("양산");
      expect(spreadAlert!.severity).toBe("high"); // 20% → high
    });

    it("표준 대비 +30% 초과 → overstandard 경보", () => {
      const rows = [makeThreeWay("양산", 1000, 1350, 5000000)]; // +35%
      const alerts = detectInefficiencies([], rows);
      const over = alerts.find((a) => a.alertType === "overstandard");
      expect(over).toBeDefined();
      expect(over!.severity).toBe("high"); // 35% → high
    });

    it("50%+ 편차 → critical", () => {
      const rows = [makeThreeWay("양산", 1000, 1600, 5000000)]; // +60%
      const alerts = detectInefficiencies([], rows);
      expect(alerts[0].severity).toBe("critical");
    });

    it("스프레드 10% 미만은 알림 없음", () => {
      const mfg = [
        makeMfg("양산", "X", "X", 5000, 100),
        makeMfg("청산", "X", "X", 5200, 80), // +4%
      ];
      const efficiency = calcFactoryEfficiencyMatrix(mfg, []);
      const alerts = detectInefficiencies(efficiency, []);
      expect(alerts.filter((a) => a.alertType === "factory_spread").length).toBe(0);
    });

    it("연간 절감액 추정 = (비싼-저렴) × 비싼공장 생산량 × 4", () => {
      const mfg = [
        makeMfg("양산", "X", "X", 5000, 100), // 저렴
        makeMfg("청산", "X", "X", 6000, 200), // 비쌈, 200개 × 4 분기
      ];
      const efficiency = calcFactoryEfficiencyMatrix(mfg, []);
      const alerts = detectInefficiencies(efficiency, []);
      const a = alerts.find((x) => x.alertType === "factory_spread");
      // (6000-5000) × 200 × 4 = 800000
      expect(a?.estimatedAnnualSavings).toBe(800000);
    });
  });
});
