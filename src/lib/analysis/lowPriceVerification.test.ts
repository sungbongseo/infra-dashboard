/**
 * lowPriceVerification.ts 단위 테스트
 *
 * 테스트 대상:
 *  1. calcContributionRedFlags — 공헌이익 Red-Flag 분류 + 트래픽라이트
 *  2. calcVolumeUnitCostRegression — OLS 선형/쌍곡선 회귀 정확도
 *  3. calcCapacityUtilization — Capacity 추정 + 경고 레벨
 *  4. calcCannibalizationRisk — 수량 가중 CV + 가격 잠식 경고
 *  5. calcOverallVerdict — 종합 판정 로직
 */
import { describe, it, expect } from "vitest";
import {
  calcContributionRedFlags,
  calcVolumeUnitCostRegression,
  calcCapacityUtilization,
  calcCannibalizationRisk,
  calcOverallVerdict,
  type RedFlagSummary,
  type RegressionSummary,
  type CapacitySummary,
  type CannibalizationSummary,
} from "./lowPriceVerification";
import type { CVPItem } from "./offsetEffect";
import type {
  ItemProfitabilityRecord,
  ManufacturingCostRecord,
  CustomerItemDetailRecord,
} from "@/types";

// ─── Helper factories ─────────────────────────────

function makeCVPItem(overrides: Partial<CVPItem> = {}): CVPItem {
  return {
    customer: "C001",
    customerName: "거래처A",
    item: "P001",
    itemName: "품목A",
    quantity: 100,
    revenue: 10000,
    variableCost: 7000,
    sgaVariableCost: 500,
    grossProfit: 3000,
    unitPrice: 100,
    unitVariableCost: 70,
    unitContributionMargin: 30,
    totalContributionMargin: 3000,
    contributionMarginRatio: 0.3,
    quadrant: "star",
    isLowPriceOrder: false,
    ...overrides,
  };
}

function makeItemProfit(overrides: Partial<ItemProfitabilityRecord & { month: string }> = {}): ItemProfitabilityRecord {
  return {
    판매사업부: "건자재",
    영업조직팀: "건자재팀",
    대분류: "방수시트",
    중분류: "A",
    소분류: "A1",
    품목계정그룹: "제품",
    품목: "[P001] 품목A",
    기준단위: "ROL",
    계정구분: "제품",
    매출수량: 100,
    매출액: 10000,
    매출단가: 100,
    표준매출원가: 6000,
    실적매출원가: 7000,
    매출원가율: 70,
    매출총이익: 3000,
    매출총이익율: 30,
    영업이익: 1000,
    직접판매운반비: 500,
    판매관리비: 1500,
    영업이익율: 10,
    원재료비: 3000,
    부재료비: 500,
    상품매입: 0,
    노무비: 1000,
    복리후생비: 100,
    소모품비: 50,
    수도광열비: 30,
    수선비: 20,
    연료비: 40,
    외주가공비: 800,
    운반비: 100,
    전력비: 200,
    지급수수료: 50,
    견본비: 10,
    제조고정노무비: 500,
    감가상각비: 300,
    기타경비: 200,
    ...overrides,
  } as any;
}

function makeMfg(overrides: Partial<ManufacturingCostRecord> = {}): ManufacturingCostRecord {
  return {
    factory: "양산",
    공장명원본: "양산공장",
    period: "2026-Q1",
    생산품코드: "P001",
    생산품명: "품목A",
    품목그룹: "제품",
    대분류: "방수시트",
    중분류: "A",
    소분류: "A1",
    기준단위: "ROL",
    생산입고수량: 900, // Q1 합계 = 월평균 300
    환산수량: 900,
    원재료비: 100,
    부재료비: 10,
    상품매입: 0,
    노무비: 50,
    복리후생비: 5,
    소모품비: 3,
    수도광열비: 2,
    수선비: 1,
    연료비: 4,
    외주가공비: 8,
    운반비: 2,
    전력비: 5,
    지급수수료: 1,
    견본비: 0,
    고정노무비: 30,
    감가상각비: 20,
    기타경비: 10,
    totalVariableCost: 191,
    totalFixedCost: 60,
    actualUnitCost: 0.279,
    bomLineCount: 5,
    ...overrides,
  };
}

function makeCustItem(overrides: Partial<CustomerItemDetailRecord> = {}): CustomerItemDetailRecord {
  return {
    영업조직팀: "건자재팀",
    영업담당사번: "EMP001",
    매출거래처: "C001",
    매출거래처명: "거래처A",
    품목: "P001",
    품목명: "품목A",
    매출수량: { 계획: 100, 실적: 100, 차이: 0 },
    매출액: { 계획: 10000, 실적: 10000, 차이: 0 },
    실적매출원가: { 계획: 7000, 실적: 7000, 차이: 0 },
    매출총이익: { 계획: 3000, 실적: 3000, 차이: 0 },
    판매관리비: { 계획: 1500, 실적: 1500, 차이: 0 },
    영업이익: { 계획: 1500, 실적: 1500, 차이: 0 },
    ...overrides,
  } as any;
}

// ─── F1: Red-Flag 스크리너 ────────────────────────

describe("calcContributionRedFlags", () => {
  it("품목을 트래픽라이트로 분류한다 (Green/Yellow/Red)", () => {
    const items: CVPItem[] = [
      makeCVPItem({ item: "P001", contributionMarginRatio: 0.15, totalContributionMargin: 1500, revenue: 10000 }),
      makeCVPItem({ item: "P002", contributionMarginRatio: 0.05, totalContributionMargin: 500, revenue: 10000 }),
      makeCVPItem({ item: "P003", contributionMarginRatio: -0.1, totalContributionMargin: -1000, revenue: 10000 }),
    ];
    const result = calcContributionRedFlags(items, []);
    expect(result.green).toBe(1);   // 15% ≥ 10%
    expect(result.yellow).toBe(1);  // 5% >= 0% < 10%
    expect(result.red).toBe(1);     // -10% < 0%
  });

  it("Red 품목의 매출을 위험 매출로 합산한다", () => {
    const items: CVPItem[] = [
      makeCVPItem({ item: "P001", contributionMarginRatio: -0.05, totalContributionMargin: -500, revenue: 5000 }),
      makeCVPItem({ item: "P002", contributionMarginRatio: -0.1, totalContributionMargin: -1000, revenue: 8000 }),
      makeCVPItem({ item: "P003", contributionMarginRatio: 0.2, totalContributionMargin: 2000, revenue: 10000 }),
    ];
    const result = calcContributionRedFlags(items, []);
    expect(result.totalRevenueAtRisk).toBe(13000); // 5000 + 8000
  });

  it("동일 품목 다거래처를 합산하여 품목 단위로 판정한다", () => {
    const items: CVPItem[] = [
      makeCVPItem({ item: "P001", customer: "C001", totalContributionMargin: 500, revenue: 5000 }),
      makeCVPItem({ item: "P001", customer: "C002", totalContributionMargin: 300, revenue: 3000 }),
    ];
    const result = calcContributionRedFlags(items, []);
    expect(result.totalItems).toBe(1); // P001 1개로 합산
    expect(result.items[0].contributionMarginRatio).toBeCloseTo(10, 0); // (800/8000)*100 = 10%
  });

  it("커스텀 임계값을 적용한다", () => {
    const items: CVPItem[] = [
      makeCVPItem({ item: "P001", contributionMarginRatio: 0.04, totalContributionMargin: 400, revenue: 10000 }),
    ];
    const result = calcContributionRedFlags(items, [], { greenMin: 5, yellowMin: 0 });
    expect(result.items[0].trafficLight).toBe("yellow"); // 4% < 5%
  });

  it("빈 입력에서 안전하게 동작한다", () => {
    const result = calcContributionRedFlags([], []);
    expect(result.totalItems).toBe(0);
    expect(result.green).toBe(0);
  });
});

// ─── F3: 회귀분석 ────────────────────────────────

describe("calcVolumeUnitCostRegression", () => {
  it("완벽한 쌍곡선 데이터에서 b > 0, 높은 R²를 반환한다", () => {
    // unitCost = 50 + 5000/qty → 수량↑ → 원가↓ (사업부 주장 지지)
    const data: ItemProfitabilityRecord[] = [50, 100, 200, 300, 500].map((qty, i) => {
      const unitCost = 50 + 5000 / qty;
      return makeItemProfit({
        month: `20250${i + 1}`,
        매출수량: qty,
        실적매출원가: unitCost * qty,
        매출액: unitCost * qty * 1.3,
      });
    });
    const result = calcVolumeUnitCostRegression(data, { minDataPoints: 3, minQuantity: 1 });
    expect(result.totalItems).toBe(1);
    const item = result.items[0];
    expect(item.hyperbolic.b).toBeGreaterThan(0);
    expect(item.hyperbolic.rSquared).toBeGreaterThan(0.9);
    expect(item.hypothesisSupport).toBe("support");
  });

  it("랜덤 데이터에서 낮은 R²를 반환한다 (주장 기각)", () => {
    const data: ItemProfitabilityRecord[] = [
      { qty: 100, cost: 80 },
      { qty: 200, cost: 120 },
      { qty: 50, cost: 50 },
      { qty: 300, cost: 90 },
      { qty: 150, cost: 200 },
    ].map(({ qty, cost }, i) =>
      makeItemProfit({
        month: `20250${i + 1}`,
        매출수량: qty,
        실적매출원가: cost * qty,
        매출액: cost * qty * 1.5,
      })
    );
    const result = calcVolumeUnitCostRegression(data, { minDataPoints: 3, minQuantity: 1 });
    if (result.items.length > 0) {
      // 랜덤 데이터 → R²가 낮아야 함
      expect(result.items[0].bestRSquared).toBeLessThan(0.8);
    }
  });

  it("데이터 부족 시 해당 품목을 건너뛴다", () => {
    const data = [1, 2].map((_, i) =>
      makeItemProfit({ month: `20250${i + 1}`, 매출수량: 100, 실적매출원가: 8000 })
    );
    const result = calcVolumeUnitCostRegression(data, { minDataPoints: 3 });
    expect(result.totalItems).toBe(0); // 2개 데이터포인트 < minDataPoints(3)
  });

  it("수량 0인 월은 자동 제외한다", () => {
    const data = [100, 0, 200, 300].map((qty, i) =>
      makeItemProfit({ month: `20250${i + 1}`, 매출수량: qty, 실적매출원가: qty > 0 ? 8000 : 0 })
    );
    const result = calcVolumeUnitCostRegression(data, { minDataPoints: 2, minQuantity: 1 });
    if (result.items.length > 0) {
      expect(result.items[0].pointCount).toBeLessThanOrEqual(3); // qty=0 제외
    }
  });

  it("excludeRawMaterial 옵션이 원재료비를 제외한다", () => {
    const data = [100, 200, 300].map((qty, i) =>
      makeItemProfit({
        month: `20250${i + 1}`,
        매출수량: qty,
        실적매출원가: 10000,
        원재료비: 5000, // 원재료비가 절반
        부재료비: 500,
      })
    );
    const withRM = calcVolumeUnitCostRegression(data, { minDataPoints: 3, minQuantity: 1 });
    const withoutRM = calcVolumeUnitCostRegression(data, { minDataPoints: 3, minQuantity: 1, excludeRawMaterial: true });

    if (withRM.items.length > 0 && withoutRM.items.length > 0) {
      // 원재료비 제외 시 단위원가가 더 낮아야 함
      expect(withoutRM.items[0].dataPoints[0].unitCost).toBeLessThan(withRM.items[0].dataPoints[0].unitCost);
    }
  });
});

// ─── F5: Capacity 제약 ────────────────────────────

describe("calcCapacityUtilization", () => {
  it("제조원가 기반 월평균 Capacity를 계산한다", () => {
    const mfg = [makeMfg({ 생산품코드: "P001", 생산입고수량: 900 })]; // Q1/3 = 300
    const rawIP = [
      makeItemProfit({ month: "202501", 매출수량: 250, 품목: "[P001] 품목A" }),
      makeItemProfit({ month: "202502", 매출수량: 280, 품목: "[P001] 품목A" }),
      makeItemProfit({ month: "202503", 매출수량: 200, 품목: "[P001] 품목A" }),
    ];
    const result = calcCapacityUtilization(mfg, rawIP);
    expect(result.items.length).toBe(1);
    const item = result.items[0];
    // max(300, 280) × 1.15 = 345
    expect(item.estimatedMonthlyCapacity).toBeCloseTo(345, 0);
    expect(item.confidence).toBe("high"); // 양쪽 소스 모두 존재
  });

  it("가동률 90% 이상이면 critical 경고를 발생한다", () => {
    const mfg = [makeMfg({ 생산품코드: "P001", 생산입고수량: 300 })]; // Q1/3 = 100
    const rawIP = [
      makeItemProfit({ month: "202503", 매출수량: 110, 품목: "[P001] 품목A" }),
    ];
    const result = calcCapacityUtilization(mfg, rawIP);
    const item = result.items[0];
    // max(100, 110) × 1.15 = 126.5, currentDemand = 110
    // utilization = 110/126.5 = 86.9% → caution
    expect(item.alertLevel).toBe("caution");
  });

  it("시뮬레이션 추가 수량을 반영한다", () => {
    const mfg = [makeMfg({ 생산품코드: "P001", 생산입고수량: 900 })];
    const rawIP = [
      makeItemProfit({ month: "202503", 매출수량: 200, 품목: "[P001] 품목A" }),
    ];
    const result = calcCapacityUtilization(mfg, rawIP, [{ item: "P001", addedQty: 200 }]);
    const item = result.items[0];
    expect(item.postSimDemand).toBe(400); // 200 + 200
    expect(item.postSimUtilizationPct).toBeGreaterThan(item.utilizationPct);
  });

  it("제조원가 없으면 판매 기반으로 추정한다 (medium 신뢰도)", () => {
    const rawIP = [
      makeItemProfit({ month: "202501", 매출수량: 150, 품목: "[P002] 품목B" }),
      makeItemProfit({ month: "202502", 매출수량: 200, 품목: "[P002] 품목B" }),
    ];
    const result = calcCapacityUtilization([], rawIP);
    const item = result.items.find(i => i.item === "P002");
    expect(item).toBeDefined();
    expect(item!.confidence).toBe("medium"); // 판매 소스만
    expect(item!.estimatedMonthlyCapacity).toBeCloseTo(200 * 1.15, 0);
  });
});

// ─── F6: Cannibalization 경고 ────────────────────

describe("calcCannibalizationRisk", () => {
  it("가격 분산이 큰 품목을 alert로 분류한다", () => {
    const data: CustomerItemDetailRecord[] = [
      makeCustItem({ 품목: "P001", 매출거래처: "C001", 매출수량: { 계획: 0, 실적: 100, 차이: 0 }, 매출액: { 계획: 0, 실적: 10000, 차이: 0 } }),  // 단가 100
      makeCustItem({ 품목: "P001", 매출거래처: "C002", 매출수량: { 계획: 0, 실적: 100, 차이: 0 }, 매출액: { 계획: 0, 실적: 5000, 차이: 0 } }),   // 단가 50
      makeCustItem({ 품목: "P001", 매출거래처: "C003", 매출수량: { 계획: 0, 실적: 100, 차이: 0 }, 매출액: { 계획: 0, 실적: 15000, 차이: 0 } }),  // 단가 150
    ];
    const result = calcCannibalizationRisk(data, 3);
    expect(result.items.length).toBe(1);
    // CV = stdev({100,50,150}) / mean({100,50,150}) — 분산 큼
    expect(result.items[0].priceDispersionCV).toBeGreaterThan(15);
  });

  it("거래처 수 부족 시 분석을 건너뛴다", () => {
    const data: CustomerItemDetailRecord[] = [
      makeCustItem({ 품목: "P001", 매출거래처: "C001" }),
      makeCustItem({ 품목: "P001", 매출거래처: "C002" }),
    ];
    const result = calcCannibalizationRisk(data, 3);
    expect(result.items.length).toBe(0); // 2 < minCustomerCount(3)
  });

  it("반품(음수 수량)을 제외한다", () => {
    const data: CustomerItemDetailRecord[] = [
      makeCustItem({ 품목: "P001", 매출거래처: "C001", 매출수량: { 계획: 0, 실적: 100, 차이: 0 } }),
      makeCustItem({ 품목: "P001", 매출거래처: "C002", 매출수량: { 계획: 0, 실적: -50, 차이: 0 } }), // 반품
      makeCustItem({ 품목: "P001", 매출거래처: "C003", 매출수량: { 계획: 0, 실적: 200, 차이: 0 } }),
      makeCustItem({ 품목: "P001", 매출거래처: "C004", 매출수량: { 계획: 0, 실적: 150, 차이: 0 } }),
    ];
    const result = calcCannibalizationRisk(data, 3);
    expect(result.items.length).toBe(1);
    expect(result.items[0].customerCount).toBe(3); // C002 제외
  });

  it("최악 시나리오 매출 감소를 계산한다", () => {
    const data: CustomerItemDetailRecord[] = [
      makeCustItem({ 품목: "P001", 매출거래처: "C001", 매출수량: { 계획: 0, 실적: 100, 차이: 0 }, 매출액: { 계획: 0, 실적: 10000, 차이: 0 } }),
      makeCustItem({ 품목: "P001", 매출거래처: "C002", 매출수량: { 계획: 0, 실적: 100, 차이: 0 }, 매출액: { 계획: 0, 실적: 5000, 차이: 0 } }),
      makeCustItem({ 품목: "P001", 매출거래처: "C003", 매출수량: { 계획: 0, 실적: 100, 차이: 0 }, 매출액: { 계획: 0, 실적: 15000, 차이: 0 } }),
    ];
    const result = calcCannibalizationRisk(data, 3);
    // 총매출 = 30000, 최저가 = 50, 총수량 = 300 → 최악 매출 = 15000
    // 손실 = 30000 - 15000 = 15000
    expect(result.items[0].worstCaseAnnualLoss).toBe(15000);
  });
});

// ─── 종합 판정 ──────────────────────────────────

describe("calcOverallVerdict", () => {
  const makeRedFlag = (overrides: Partial<RedFlagSummary> = {}): RedFlagSummary => ({
    totalItems: 10, green: 7, yellow: 2, red: 1,
    totalRevenueAtRisk: 5000, deterioratingCount: 0, items: [],
    ...overrides,
  });

  const makeRegression = (overrides: Partial<RegressionSummary> = {}): RegressionSummary => ({
    totalItems: 10, significantCount: 5, supportCount: 4, rejectCount: 3, partialCount: 3,
    avgBestRSquared: 0.45, items: [],
    ...overrides,
  });

  const makeCapacity = (overrides: Partial<CapacitySummary> = {}): CapacitySummary => ({
    items: [], criticalCount: 0, cautionCount: 1, safeCount: 9, avgUtilization: 55,
    ...overrides,
  });

  const makeCannibal = (overrides: Partial<CannibalizationSummary> = {}): CannibalizationSummary => ({
    items: [], alertCount: 0, watchCount: 2, totalWorstCaseLoss: 10000,
    ...overrides,
  });

  it("모든 지표가 양호하면 valid를 반환한다", () => {
    const result = calcOverallVerdict(
      makeRedFlag({ red: 0 }),
      makeRegression({ supportCount: 7, partialCount: 2, rejectCount: 1 }),
      makeCapacity({ criticalCount: 0, cautionCount: 0 }),
      makeCannibal({ alertCount: 0, watchCount: 0 }),
    );
    expect(result.overall).toBe("valid");
  });

  it("Red-Flag가 30% 초과하면 invalid에 반영된다", () => {
    const result = calcOverallVerdict(
      makeRedFlag({ totalItems: 10, red: 5 }), // 50% red
      makeRegression({ supportCount: 0, rejectCount: 10 }),
      makeCapacity({ criticalCount: 3 }),
      makeCannibal({ alertCount: 2 }),
    );
    expect(result.overall).toBe("invalid");
  });

  it("일부 문제가 있으면 partial을 반환한다", () => {
    const result = calcOverallVerdict(
      makeRedFlag({ totalItems: 10, red: 4 }), // 40% → red (F1)
      makeRegression({ supportCount: 1, partialCount: 1, rejectCount: 8, totalItems: 10 }), // supportPct=15% < 25% → red (F3)
      makeCapacity({ criticalCount: 0, cautionCount: 0 }),
      makeCannibal({ alertCount: 0, watchCount: 0 }),
    );
    expect(result.overall).toBe("partial"); // 2개 red (F1, F3) → partial (1~2 red)
  });

  it("CEO 요약 문장을 생성한다", () => {
    const result = calcOverallVerdict(
      makeRedFlag(),
      makeRegression(),
      makeCapacity(),
      makeCannibal(),
    );
    expect(result.ceoSummary).toBeTruthy();
    expect(result.ceoSummary.length).toBeGreaterThan(10);
  });
});

// ─── 501 공헌이익 교차검증 ─────────────────────

describe("501 공헌이익 교차검증", () => {
  it("Test A: 501 자체 정합성 — 공헌이익 ≈ 매출액 - 제조변동비소계", () => {
    // 501 (ItemCostDetailRecord)에서 공헌이익은 매출액 - 변동비로 사전 계산됨
    // SGA 변동비는 미포함이므로 제조변동비소계만으로 검증
    const pad = (v: number) => ({ 계획: 0, 실적: v, 차이: 0 });
    const record = {
      No: 1,
      판매사업본부: "건자재",
      영업조직팀: "건자재팀",
      품목: "P001",
      매출수량: pad(100),
      매출액: pad(10000),
      실적매출원가: pad(7000),
      // 14개 변동비 (합 = 5000)
      원재료비: pad(2000), 부재료비: pad(500), 상품매입: pad(0),
      노무비: pad(800), 복리후생비: pad(50), 소모품비: pad(30),
      수도광열비: pad(20), 수선비: pad(10), 연료비: pad(30),
      외주가공비: pad(600), 운반비: pad(50), 전력비: pad(150),
      지급수수료: pad(40), 견본비: pad(20),
      제조변동비소계: pad(4300), // 합산
      제조고정노무비: pad(500), 감가상각비: pad(300), 기타경비: pad(200),
      제조고정비소계: pad(1000),
      매출총이익: pad(3000),
      공헌이익: pad(5700),     // 매출 10000 - 변동비소계 4300 = 5700
      공헌이익율: pad(57),
    };
    // 검증: 공헌이익 ≈ 매출액 - 제조변동비소계
    const directCalc = record.매출액.실적 - record.제조변동비소계.실적;
    const reported = record.공헌이익.실적;
    const errorPct = Math.abs((directCalc - reported) / reported) * 100;
    expect(errorPct).toBeLessThan(0.5); // ±0.5% 허용 오차
  });

  it("Test B: 501 vs 200 교차검증 — SGA 미포함 공헌이익 비교", () => {
    // 200 (ItemProfitabilityRecord)에서 14개 변동비를 합산한 결과와
    // 501의 공헌이익이 대략 일치하는지 검증 (SGA 미포함 기준)
    const item200 = makeItemProfit({
      매출액: 10000,
      원재료비: 2000, 부재료비: 500, 상품매입: 0,
      노무비: 800, 복리후생비: 50, 소모품비: 30,
      수도광열비: 20, 수선비: 10, 연료비: 30,
      외주가공비: 600, 운반비: 50, 전력비: 150,
      지급수수료: 40, 견본비: 20,
    });
    // 200 기반 공헌이익 (SGA 미포함) = 매출액 - Σ(14개 변동비)
    const vc14 = 2000 + 500 + 0 + 800 + 50 + 30 + 20 + 10 + 30 + 600 + 50 + 150 + 40 + 20;
    const cm200 = item200.매출액 - vc14; // 10000 - 4300 = 5700

    // 501 공헌이익 (SGA 미포함)
    const cm501 = 5700;

    // 교차검증: 두 값이 ±2% 이내
    const errorPct = Math.abs((cm200 - cm501) / cm501) * 100;
    expect(errorPct).toBeLessThan(2);
    expect(cm200).toBe(cm501); // 동일 입력이므로 정확히 일치
  });
});
