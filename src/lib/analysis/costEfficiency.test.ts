/**
 * costEfficiency.ts 단위 테스트
 *
 * 테스트 대상:
 *  1. calcFactoryEfficiencyMatrix — 공장 간 동일 품목 효율성 매트릭스
 *  2. calcStandardCostAccuracyKPI — 표준원가 정확도 등급 (A/B/C/D)
 *  3. calcFactoryStandardCostCoverage — 공장별 표준원가 커버리지
 *  4. detectInefficiencies — 저효율 라인 자동 탐지
 */
import { describe, it, expect } from "vitest";
import {
  calcFactoryEfficiencyMatrix,
  calcStandardCostAccuracyKPI,
  calcFactoryStandardCostCoverage,
  detectInefficiencies,
  type FactoryEfficiencyRow,
} from "./costEfficiency";
import type {
  ManufacturingCostRecord,
  StandardCostBookRecord,
  ThreeWayComparisonRow,
} from "@/types";

// ─── Helper factories ──────────────────────────────────

function makeMfg(
  overrides: Partial<ManufacturingCostRecord> = {}
): ManufacturingCostRecord {
  return {
    factory: "양산",
    공장명원본: "양산공장",
    period: "2026-Q1",
    생산품코드: "ITEM001",
    생산품명: "테스트 품목",
    품목그룹: "제품",
    대분류: "화학",
    중분류: "접착제",
    소분류: "A",
    기준단위: "KG",
    생산입고수량: 1000,
    환산수량: 1000,
    원재료비: 100,
    부재료비: 10,
    상품매입: 0,
    노무비: 50,
    복리후생비: 5,
    소모품비: 3,
    수도광열비: 2,
    수선비: 1,
    연료비: 4,
    외주가공비: 0,
    운반비: 2,
    전력비: 8,
    지급수수료: 1,
    견본비: 0,
    고정노무비: 30,
    감가상각비: 20,
    기타경비: 10,
    totalVariableCost: 186,
    totalFixedCost: 60,
    actualUnitCost: 0.246,
    bomLineCount: 5,
    ...overrides,
  };
}

function makeStd(
  overrides: Partial<StandardCostBookRecord> = {}
): StandardCostBookRecord {
  return {
    factory: "양산",
    품목코드: "ITEM001",
    품목명: "테스트 품목",
    품목계정그룹: "제품",
    기본단위: "KG",
    규격: "",
    표준원가: 0.25,
    유효시작: "2026-01-01",
    유효종료: "9999-12-31",
    ...overrides,
  };
}

function make3Way(
  overrides: Partial<ThreeWayComparisonRow> = {}
): ThreeWayComparisonRow {
  return {
    itemCode: "ITEM001",
    itemName: "테스트 품목",
    factory: "양산",
    salesQty: 500,
    salesAmount: 1_000_000,
    avgSalesPrice: 2000,
    standardCost: 1500,
    hasStandard: true,
    standardCostFactory: "양산",
    actualUnitCost: 1600,
    hasManufacturing: true,
    actualCostFactory: "양산",
    itemCategory: "제품",
    actualCostSource: "manufacturing",
    noteKind: "three_way_matched",
    salesVsStdMarginPct: 25,
    salesVsActualMarginPct: 20,
    stdVsActualVariancePct: 6.67,
    marginVarianceImpact: 50_000,
    salesImpact: 50_000,
    note: "",
    dataQualityFlags: [],
    actualCostConfidence: 1.0,
    ...overrides,
  };
}

function makeEfficiencyRow(
  overrides: Partial<FactoryEfficiencyRow> = {}
): FactoryEfficiencyRow {
  return {
    itemCode: "EFF001",
    itemName: "효율 품목",
    costByFactory: { "양산": 100, "청산": 115 },
    stdCostByFactory: {},
    qtyByFactory: { "양산": 1000, "청산": 500 },
    cheapestFactory: "양산",
    cheapestCost: 100,
    mostExpensiveFactory: "청산",
    mostExpensiveCost: 115,
    spreadPct: 15,
    multiFactoryProduced: true,
    ...overrides,
  };
}

// ─── 1. calcFactoryEfficiencyMatrix ─────────────────────

describe("calcFactoryEfficiencyMatrix", () => {
  it("1. single factory — no spread, spreadPct=0", () => {
    const mfg = [makeMfg({ factory: "양산", 생산품코드: "A1", actualUnitCost: 100, 생산입고수량: 500 })];
    const std = [makeStd({ factory: "양산", 품목코드: "A1", 표준원가: 95 })];

    const result = calcFactoryEfficiencyMatrix(mfg, std);
    expect(result).toHaveLength(1);

    const row = result[0];
    expect(row.itemCode).toBe("A1");
    expect(row.multiFactoryProduced).toBe(false);
    expect(row.cheapestFactory).toBe("양산");
    expect(row.mostExpensiveFactory).toBe("양산");
    expect(row.spreadPct).toBe(0);
    expect(row.stdCostByFactory["양산"]).toBe(95);
  });

  it("2. multi-factory with spread calculation", () => {
    const mfg = [
      makeMfg({ factory: "양산", 생산품코드: "B1", 생산품명: "B품목", actualUnitCost: 100, 생산입고수량: 1000 }),
      makeMfg({ factory: "청산", 생산품코드: "B1", 생산품명: "B품목", actualUnitCost: 130, 생산입고수량: 800 }),
      makeMfg({ factory: "울산", 생산품코드: "B1", 생산품명: "B품목", actualUnitCost: 110, 생산입고수량: 600 }),
    ];
    const std: StandardCostBookRecord[] = [];

    const result = calcFactoryEfficiencyMatrix(mfg, std);
    expect(result).toHaveLength(1);

    const row = result[0];
    expect(row.multiFactoryProduced).toBe(true);
    expect(row.cheapestFactory).toBe("양산");
    expect(row.cheapestCost).toBe(100);
    expect(row.mostExpensiveFactory).toBe("청산");
    expect(row.mostExpensiveCost).toBe(130);
    // spreadPct = (130 - 100) / 100 * 100 = 30
    expect(row.spreadPct).toBe(30);
    expect(row.qtyByFactory["양산"]).toBe(1000);
    expect(row.qtyByFactory["청산"]).toBe(800);
    expect(row.qtyByFactory["울산"]).toBe(600);
  });

  it("3. empty input returns empty array", () => {
    const result = calcFactoryEfficiencyMatrix([], []);
    expect(result).toHaveLength(0);
  });

  it("sorts multi-factory items first, then by descending spreadPct", () => {
    const mfg = [
      makeMfg({ factory: "양산", 생산품코드: "C1", actualUnitCost: 50, 생산입고수량: 100 }),
      makeMfg({ factory: "양산", 생산품코드: "D1", actualUnitCost: 100, 생산입고수량: 100 }),
      makeMfg({ factory: "청산", 생산품코드: "D1", actualUnitCost: 120, 생산입고수량: 100 }),
      makeMfg({ factory: "양산", 생산품코드: "E1", actualUnitCost: 100, 생산입고수량: 100 }),
      makeMfg({ factory: "울산", 생산품코드: "E1", actualUnitCost: 150, 생산입고수량: 100 }),
    ];

    const result = calcFactoryEfficiencyMatrix(mfg, []);
    expect(result[0].itemCode).toBe("E1"); // 50% spread
    expect(result[1].itemCode).toBe("D1"); // 20% spread
    expect(result[2].itemCode).toBe("C1"); // single factory
  });

  it("skips rows with actualUnitCost <= 0", () => {
    const mfg = [
      makeMfg({ factory: "양산", 생산품코드: "Z1", actualUnitCost: 0, 생산입고수량: 100 }),
      makeMfg({ factory: "양산", 생산품코드: "Z2", actualUnitCost: -10, 생산입고수량: 100 }),
    ];
    const result = calcFactoryEfficiencyMatrix(mfg, []);
    expect(result).toHaveLength(0);
  });

  it("only includes standard costs for 제품/상품 category", () => {
    const mfg = [makeMfg({ factory: "양산", 생산품코드: "F1", actualUnitCost: 200, 생산입고수량: 50 })];
    const std = [
      makeStd({ factory: "양산", 품목코드: "F1", 품목계정그룹: "원재료", 표준원가: 180 }),
      makeStd({ factory: "양산", 품목코드: "F1", 품목계정그룹: "제품", 표준원가: 190 }),
    ];
    const result = calcFactoryEfficiencyMatrix(mfg, std);
    expect(result[0].stdCostByFactory["양산"]).toBe(190);
  });
});

// ─── 2. calcStandardCostAccuracyKPI ─────────────────────

describe("calcStandardCostAccuracyKPI", () => {
  it("4. Grade A — 70%+ sales within ±5%", () => {
    // 80% of sales within ±3%, 20% at ±8%
    const rows = [
      make3Way({ salesAmount: 400_000, stdVsActualVariancePct: 2 }),
      make3Way({ salesAmount: 400_000, stdVsActualVariancePct: -3 }),
      make3Way({ salesAmount: 200_000, stdVsActualVariancePct: 8 }),
    ];
    const kpi = calcStandardCostAccuracyKPI(rows);
    expect(kpi.grade).toBe("A");
    expect(kpi.sampleSize).toBe(3);
    // within5PctRatio = 800_000 / 1_000_000 = 0.8
    expect(kpi.within5PctRatio).toBeCloseTo(0.8, 2);
  });

  it("5. Grade B — 70%+ sales within ±10% but not ±5%", () => {
    // 30% within ±5%, 50% at ±7%, 20% at ±15%
    const rows = [
      make3Way({ salesAmount: 300_000, stdVsActualVariancePct: 3 }),
      make3Way({ salesAmount: 500_000, stdVsActualVariancePct: 7 }),
      make3Way({ salesAmount: 200_000, stdVsActualVariancePct: 15 }),
    ];
    const kpi = calcStandardCostAccuracyKPI(rows);
    expect(kpi.grade).toBe("B");
    expect(kpi.within5PctRatio).toBeCloseTo(0.3, 2);
    expect(kpi.within10PctRatio).toBeCloseTo(0.8, 2);
  });

  it("6. Grade C — weightedAbsVariancePct <= 20 but not A or B", () => {
    // 60% at ±12%, 40% at ±18%  → within10=0.0 → not B
    // weightedAbs = 0.6*12 + 0.4*18 = 14.4 → <=20 → C
    const rows = [
      make3Way({ salesAmount: 600_000, stdVsActualVariancePct: 12 }),
      make3Way({ salesAmount: 400_000, stdVsActualVariancePct: 18 }),
    ];
    const kpi = calcStandardCostAccuracyKPI(rows);
    expect(kpi.grade).toBe("C");
    expect(kpi.weightedAbsVariancePct).toBeCloseTo(14.4, 1);
  });

  it("7. Grade D — poor accuracy (weightedAbsVariancePct > 20)", () => {
    const rows = [
      make3Way({ salesAmount: 500_000, stdVsActualVariancePct: 30 }),
      make3Way({ salesAmount: 500_000, stdVsActualVariancePct: -25 }),
    ];
    const kpi = calcStandardCostAccuracyKPI(rows);
    // weightedAbs = (30*500k + 25*500k) / 1M = 27.5 → D
    expect(kpi.grade).toBe("D");
    expect(kpi.weightedAbsVariancePct).toBeCloseTo(27.5, 1);
  });

  it("8. Empty matched set returns D with zero metrics", () => {
    const rows = [
      make3Way({ hasStandard: false }),
      make3Way({ hasManufacturing: false }),
      make3Way({ salesAmount: 0 }),
      make3Way({ stdVsActualVariancePct: null }),
    ];
    const kpi = calcStandardCostAccuracyKPI(rows);
    expect(kpi.sampleSize).toBe(0);
    expect(kpi.grade).toBe("D");
    expect(kpi.diagnosis).toContain("샘플 부족");
    expect(kpi.weightedAbsVariancePct).toBe(0);
    expect(kpi.medianAbsVariancePct).toBe(0);
    expect(kpi.p90AbsVariancePct).toBe(0);
  });

  it("9. Median sentinel — all items 0% variance yields median=0.0", () => {
    const rows = [
      make3Way({ salesAmount: 100_000, stdVsActualVariancePct: 0 }),
      make3Way({ salesAmount: 200_000, stdVsActualVariancePct: 0 }),
      make3Way({ salesAmount: 300_000, stdVsActualVariancePct: 0 }),
    ];
    const kpi = calcStandardCostAccuracyKPI(rows);
    // median should be exactly 0, not null sentinel
    expect(kpi.medianAbsVariancePct).toBe(0);
    expect(kpi.p90AbsVariancePct).toBe(0);
    expect(kpi.within5PctRatio).toBe(1);
    expect(kpi.grade).toBe("A");
  });

  it("overStandardRatio is sales-weighted", () => {
    const rows = [
      make3Way({ salesAmount: 900_000, stdVsActualVariancePct: -2 }),
      make3Way({ salesAmount: 100_000, stdVsActualVariancePct: 3 }),
    ];
    const kpi = calcStandardCostAccuracyKPI(rows);
    expect(kpi.overStandardRatio).toBeCloseTo(0.1, 2);
  });

  it("p90 correctly identifies 90th percentile by cumulative sales weight", () => {
    // 10 items each 100k sales, variance 1% to 10%
    const rows = Array.from({ length: 10 }, (_, i) =>
      make3Way({ salesAmount: 100_000, stdVsActualVariancePct: i + 1 })
    );
    const kpi = calcStandardCostAccuracyKPI(rows);
    // cumWeight reaches 90% (900k/1M) at item with abs=9
    expect(kpi.p90AbsVariancePct).toBe(9);
  });

  it("completely empty array returns D", () => {
    const kpi = calcStandardCostAccuracyKPI([]);
    expect(kpi.grade).toBe("D");
    expect(kpi.sampleSize).toBe(0);
  });
});

// ─── 3. calcFactoryStandardCostCoverage ─────────────────

describe("calcFactoryStandardCostCoverage", () => {
  it("10. Complete coverage (>=95%) → status=complete", () => {
    // 20 items manufactured, 19 have standard cost → 95%
    const mfg = Array.from({ length: 20 }, (_, i) =>
      makeMfg({ factory: "양산", 생산품코드: `P${String(i).padStart(3, "0")}`, actualUnitCost: 10 })
    );
    const std = Array.from({ length: 19 }, (_, i) =>
      makeStd({ factory: "양산", 품목코드: `P${String(i).padStart(3, "0")}` })
    );
    const result = calcFactoryStandardCostCoverage(mfg, std);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("complete");
    expect(result[0].coveragePct).toBe(95);
    expect(result[0].manufacturedItems).toBe(20);
    expect(result[0].standardRegistered).toBe(19);
    expect(result[0].missingItems).toHaveLength(1);
    expect(result[0].missingItems[0].code).toBe("P019");
  });

  it("11. Partial coverage (0% < coverage < 95%) → status=partial", () => {
    const mfg = [
      makeMfg({ factory: "청산", 생산품코드: "X1", actualUnitCost: 10 }),
      makeMfg({ factory: "청산", 생산품코드: "X2", actualUnitCost: 20 }),
      makeMfg({ factory: "청산", 생산품코드: "X3", actualUnitCost: 30 }),
    ];
    const std = [makeStd({ factory: "청산", 품목코드: "X1" })];
    const result = calcFactoryStandardCostCoverage(mfg, std);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("partial");
    expect(result[0].coveragePct).toBeCloseTo(33.33, 1);
    expect(result[0].missingItems).toHaveLength(2);
  });

  it("12. Missing coverage (0%) → status=missing", () => {
    const mfg = [
      makeMfg({ factory: "울산", 생산품코드: "Y1", actualUnitCost: 10 }),
      makeMfg({ factory: "울산", 생산품코드: "Y2", actualUnitCost: 20 }),
    ];
    const result = calcFactoryStandardCostCoverage(mfg, []);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("missing");
    expect(result[0].coveragePct).toBe(0);
    expect(result[0].standardRegistered).toBe(0);
    expect(result[0].missingItems).toHaveLength(2);
  });

  it("missing items list capped at 10", () => {
    const mfg = Array.from({ length: 15 }, (_, i) =>
      makeMfg({ factory: "용산", 생산품코드: `M${i}`, actualUnitCost: 10 })
    );
    const result = calcFactoryStandardCostCoverage(mfg, []);
    expect(result[0].missingItems.length).toBeLessThanOrEqual(10);
  });

  it("standard costs for non-제품/상품 categories are ignored", () => {
    const mfg = [makeMfg({ factory: "양산", 생산품코드: "W1", actualUnitCost: 10 })];
    const std = [makeStd({ factory: "양산", 품목코드: "W1", 품목계정그룹: "원재료" })];
    const result = calcFactoryStandardCostCoverage(mfg, std);
    expect(result[0].status).toBe("missing");
    expect(result[0].standardRegistered).toBe(0);
  });

  it("sorted by manufacturedItems descending", () => {
    const mfg = [
      makeMfg({ factory: "양산", 생산품코드: "A1", actualUnitCost: 10 }),
      makeMfg({ factory: "청산", 생산품코드: "B1", actualUnitCost: 10 }),
      makeMfg({ factory: "청산", 생산품코드: "B2", actualUnitCost: 10 }),
      makeMfg({ factory: "청산", 생산품코드: "B3", actualUnitCost: 10 }),
    ];
    const result = calcFactoryStandardCostCoverage(mfg, []);
    expect(result[0].factory).toBe("청산"); // 3 items
    expect(result[1].factory).toBe("양산"); // 1 item
  });

  it("100% coverage → status=complete", () => {
    const mfg = [
      makeMfg({ factory: "양산", 생산품코드: "A1", actualUnitCost: 10 }),
      makeMfg({ factory: "양산", 생산품코드: "A2", actualUnitCost: 20 }),
    ];
    const std = [
      makeStd({ factory: "양산", 품목코드: "A1" }),
      makeStd({ factory: "양산", 품목코드: "A2" }),
    ];
    const result = calcFactoryStandardCostCoverage(mfg, std);
    expect(result[0].coveragePct).toBe(100);
    expect(result[0].status).toBe("complete");
    expect(result[0].missingItems).toHaveLength(0);
  });

  it("duplicate manufacturing records for same factory+item are deduplicated", () => {
    const mfg = [
      makeMfg({ factory: "양산", 생산품코드: "D1", actualUnitCost: 10 }),
      makeMfg({ factory: "양산", 생산품코드: "D1", actualUnitCost: 12 }), // same code
    ];
    const result = calcFactoryStandardCostCoverage(mfg, []);
    expect(result[0].manufacturedItems).toBe(1); // deduplicated
  });
});

// ─── 4. detectInefficiencies ────────────────────────────

describe("detectInefficiencies", () => {
  it("13. Factory spread alert detection (spreadPct >= default 10%)", () => {
    const efficiency = [makeEfficiencyRow({
      itemCode: "SP1",
      itemName: "스프레드 품목",
      spreadPct: 15,
    })];

    const alerts = detectInefficiencies(efficiency, []);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe("factory_spread");
    expect(alerts[0].itemCode).toBe("SP1");
    expect(alerts[0].cheapestOption?.factory).toBe("양산");
    expect(alerts[0].currentLocation?.factory).toBe("청산");
  });

  it("14. Overstandard alert detection (positive variance >= 20%)", () => {
    const threeWay = [
      make3Way({
        itemCode: "OV1",
        itemName: "초과 품목",
        factory: "양산",
        stdVsActualVariancePct: 25,
        hasStandard: true,
        hasManufacturing: true,
        actualUnitCost: 1250,
      }),
    ];

    const alerts = detectInefficiencies([], threeWay);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe("overstandard");
    expect(alerts[0].message).toContain("25.0%");
    expect(alerts[0].currentLocation?.unitCost).toBe(1250);
  });

  it("15a. Severity critical for spreadPct >= 50%", () => {
    const efficiency = [makeEfficiencyRow({
      itemCode: "C1",
      spreadPct: 55,
      cheapestCost: 100,
      mostExpensiveCost: 155,
      costByFactory: { a: 100, b: 155 },
    })];
    const alerts = detectInefficiencies(efficiency, []);
    expect(alerts[0].severity).toBe("critical");
  });

  it("15b. Severity high for spreadPct >= 15% and < 30%", () => {
    const efficiency = [makeEfficiencyRow({
      itemCode: "H1",
      spreadPct: 22,
      cheapestCost: 100,
      mostExpensiveCost: 122,
      costByFactory: { a: 100, b: 122 },
    })];
    const alerts = detectInefficiencies(efficiency, []);
    expect(alerts[0].severity).toBe("high");
  });

  it("15c. Severity medium for spreadPct >= 10% and < 15%", () => {
    const efficiency = [makeEfficiencyRow({
      itemCode: "M1",
      spreadPct: 12,
      cheapestCost: 100,
      mostExpensiveCost: 112,
      costByFactory: { a: 100, b: 112 },
    })];
    const alerts = detectInefficiencies(efficiency, []);
    expect(alerts[0].severity).toBe("medium");
  });

  it("15d. Severity classification for overstandard (critical >= 50%, high >= 30%, medium else)", () => {
    const threeWay = [
      make3Way({ itemCode: "S1", stdVsActualVariancePct: 55, hasStandard: true, hasManufacturing: true }),
      make3Way({ itemCode: "S2", stdVsActualVariancePct: 35, hasStandard: true, hasManufacturing: true }),
      make3Way({ itemCode: "S3", stdVsActualVariancePct: 22, hasStandard: true, hasManufacturing: true }),
    ];
    const alerts = detectInefficiencies([], threeWay);
    const byCode = Object.fromEntries(alerts.map((a) => [a.itemCode, a]));
    expect(byCode["S1"].severity).toBe("critical");
    expect(byCode["S2"].severity).toBe("high");
    expect(byCode["S3"].severity).toBe("medium");
  });

  it("16. Annual savings = (mostExpensiveCost - cheapestCost) * mostExpensive qty * 4", () => {
    const efficiency = [makeEfficiencyRow({
      itemCode: "SV1",
      cheapestCost: 100,
      mostExpensiveCost: 150,
      mostExpensiveFactory: "청산",
      qtyByFactory: { "양산": 2000, "청산": 500 },
      spreadPct: 50,
    })];

    const alerts = detectInefficiencies(efficiency, []);
    expect(alerts).toHaveLength(1);
    // savings = (150 - 100) * 500 * 4 = 100_000
    expect(alerts[0].estimatedAnnualSavings).toBe(100_000);
  });

  it("understandard alert for negative variance >= threshold (abs)", () => {
    const threeWay = [
      make3Way({
        itemCode: "UN1",
        stdVsActualVariancePct: -30,
        hasStandard: true,
        hasManufacturing: true,
        actualUnitCost: 700,
      }),
    ];
    const alerts = detectInefficiencies([], threeWay);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe("understandard");
    expect(alerts[0].message).toContain("30.0%");
    expect(alerts[0].message).toContain("하향 조정");
  });

  it("does not emit factory_spread alert when spreadPct < threshold", () => {
    const efficiency = [makeEfficiencyRow({
      spreadPct: 5, // below default threshold of 10
    })];
    const alerts = detectInefficiencies(efficiency, []);
    expect(alerts).toHaveLength(0);
  });

  it("does not emit overstandard alert when abs(variance) < threshold", () => {
    const threeWay = [
      make3Way({ stdVsActualVariancePct: 15, hasStandard: true, hasManufacturing: true }),
    ];
    const alerts = detectInefficiencies([], threeWay);
    expect(alerts).toHaveLength(0);
  });

  it("respects custom thresholds", () => {
    const threeWay = [
      make3Way({ stdVsActualVariancePct: 8, hasStandard: true, hasManufacturing: true }),
    ];
    const alerts = detectInefficiencies([], threeWay, { overstandardThreshold: 5 });
    expect(alerts).toHaveLength(1);
  });

  it("custom factorySpreadThreshold works", () => {
    const efficiency = [makeEfficiencyRow({ spreadPct: 7 })];
    // default=10 would skip, but custom=5 catches
    const alerts = detectInefficiencies(efficiency, [], { factorySpreadThreshold: 5 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe("factory_spread");
  });

  it("skips single-factory items for factory_spread", () => {
    const efficiency = [makeEfficiencyRow({
      multiFactoryProduced: false,
      spreadPct: 0,
    })];
    const alerts = detectInefficiencies(efficiency, []);
    expect(alerts).toHaveLength(0);
  });

  it("skips rows without hasStandard or hasManufacturing for overstandard", () => {
    const threeWay = [
      make3Way({ stdVsActualVariancePct: 50, hasStandard: false }),
      make3Way({ stdVsActualVariancePct: 50, hasManufacturing: false }),
      make3Way({ stdVsActualVariancePct: null, hasStandard: true, hasManufacturing: true }),
    ];
    const alerts = detectInefficiencies([], threeWay);
    expect(alerts).toHaveLength(0);
  });

  it("sorted by severity (critical first), then by savings descending", () => {
    const efficiency: FactoryEfficiencyRow[] = [
      // medium severity, high savings
      makeEfficiencyRow({
        itemCode: "A",
        spreadPct: 12,
        cheapestCost: 100,
        mostExpensiveCost: 112,
        mostExpensiveFactory: "y",
        qtyByFactory: { x: 100, y: 10000 },
      }),
      // critical severity, low savings
      makeEfficiencyRow({
        itemCode: "B",
        spreadPct: 100,
        cheapestCost: 100,
        mostExpensiveCost: 200,
        mostExpensiveFactory: "y",
        qtyByFactory: { x: 100, y: 10 },
      }),
    ];
    const alerts = detectInefficiencies(efficiency, []);
    // critical comes first regardless of savings
    expect(alerts[0].itemCode).toBe("B");
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[1].itemCode).toBe("A");
    expect(alerts[1].severity).toBe("medium");
  });

  it("combines factory_spread and overstandard alerts", () => {
    const efficiency = [makeEfficiencyRow({ spreadPct: 20 })];
    const threeWay = [
      make3Way({ itemCode: "OV2", stdVsActualVariancePct: 25, hasStandard: true, hasManufacturing: true }),
    ];
    const alerts = detectInefficiencies(efficiency, threeWay);
    const types = alerts.map((a) => a.alertType);
    expect(types).toContain("factory_spread");
    expect(types).toContain("overstandard");
  });
});
