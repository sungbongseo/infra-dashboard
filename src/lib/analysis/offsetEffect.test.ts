import { describe, it, expect } from "vitest";
import {
  extractManufacturingFixedCost,
  calcCustomerItemCVP,
  calcTotalViewSimulation,
  calcItemPool,
  calcPoolSimulation,
  calcWaterfallSteps,
  verifyIntegrity,
} from "./offsetEffect";
import type { CustomerItemDetailRecord, ItemProfitabilityRecord, PlanActualDiff } from "@/types";

// ─── Test Helpers ────────────────────────────────────────────

const pad = (v: number): PlanActualDiff => ({ 계획: v, 실적: v, 차이: 0 });
const pad0 = (): PlanActualDiff => ({ 계획: 0, 실적: 0, 차이: 0 });

function makeCustItem(
  overrides: Partial<{
    customer: string;
    customerName: string;
    item: string;
    itemName: string;
    qty: number;
    revenue: number;
    cost: number;
  }> = {}
): CustomerItemDetailRecord {
  const {
    customer = "C001",
    customerName = "거래처A",
    item = "P001",
    itemName = "품목A",
    qty = 100,
    revenue = 10000,
    cost = 7000,
  } = overrides;
  const gp = revenue - cost;
  return {
    No: 1,
    영업조직팀: "Infra사업본부",
    영업담당사번: "E001",
    매출거래처: customer,
    매출거래처명: customerName,
    품목: item,
    품목명: itemName,
    거래처대분류: "",
    거래처중분류: "",
    거래처소분류: "",
    제품군: "",
    매출연월: "",
    계정구분: "P1",
    매출유형: "",
    품목군: "",
    중분류코드: "",
    공장: "",
    제품내수매출: pad0(),
    제품수출매출: pad0(),
    매출수량: pad(qty),
    환산수량: pad0(),
    매출액: pad(revenue),
    실적매출원가: pad(cost),
    상품매입: pad0(),
    매출총이익: pad(gp),
    판매관리비: pad0(),
    판관변동_직접판매운반비: pad0(),
    영업이익: pad(gp),
    매출총이익율: pad0(),
    영업이익율: pad0(),
  };
}

function makeItemProfit(
  overrides: Partial<{
    item: string;
    대분류: string;
    qty: number;
    revenue: number;
    cost: number;
    제조고정노무비: number;
    감가상각비: number;
    기타경비: number;
  }> = {}
): ItemProfitabilityRecord {
  const {
    item = "[P001] 품목A",
    대분류 = "방수",
    qty = 100,
    revenue = 10000,
    cost = 7000,
    제조고정노무비 = 300,
    감가상각비 = 200,
    기타경비 = 100,
  } = overrides;
  return {
    판매사업부: "Infra",
    영업조직팀: "Infra사업본부",
    대분류,
    중분류: "",
    소분류: "",
    품목계정그룹: "제품",
    품목: item,
    기준단위: "",
    계정구분: "P1",
    매출수량: qty,
    매출액: revenue,
    매출단가: revenue / qty,
    표준매출원가: cost,
    실적매출원가: cost,
    매출원가율: (cost / revenue) * 100,
    매출총이익: revenue - cost,
    매출총이익율: ((revenue - cost) / revenue) * 100,
    영업이익: revenue - cost,
    직접판매운반비: 0,
    판매관리비: 0,
    영업이익율: 0,
    원재료비: 0, 부재료비: 0, 상품매입: 0, 노무비: 0, 복리후생비: 0,
    소모품비: 0, 수도광열비: 0, 수선비: 0, 연료비: 0, 외주가공비: 0,
    운반비: 0, 전력비: 0, 지급수수료: 0, 견본비: 0,
    제조고정노무비, 감가상각비, 기타경비,
  };
}

describe("offsetEffect", () => {
  describe("extractManufacturingFixedCost", () => {
    it("ItemProfitabilityRecord number 타입 합산", () => {
      const items = [
        makeItemProfit({ 제조고정노무비: 300, 감가상각비: 200, 기타경비: 100 }),
        makeItemProfit({ 제조고정노무비: 500, 감가상각비: 300, 기타경비: 200 }),
      ];
      expect(extractManufacturingFixedCost(items)).toBe(1600);
    });

    it("빈 배열 → 0", () => {
      expect(extractManufacturingFixedCost([])).toBe(0);
    });

    it("PlanActualDiff 타입도 지원", () => {
      const items = [
        { 제조고정노무비: pad(100), 감가상각비: pad(50), 기타경비: pad(30) },
      ] as any;
      expect(extractManufacturingFixedCost(items)).toBe(180);
    });
  });

  describe("calcCustomerItemCVP", () => {
    it("단일 거래처×품목 집계", () => {
      const data = [makeCustItem({ qty: 100, revenue: 10000, cost: 7000 })];
      const { items, summary } = calcCustomerItemCVP(data, 1000);
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(100);
      expect(items[0].revenue).toBe(10000);
      expect(items[0].variableCost).toBe(7000);
      expect(items[0].unitPrice).toBe(100);
      expect(items[0].unitVariableCost).toBe(70);
      expect(items[0].unitContributionMargin).toBe(30);
      expect(summary.totalOperatingProfit).toBe(3000 - 1000);
    });

    it("매출 0 항목 필터링", () => {
      const data = [
        makeCustItem({ customer: "C1", qty: 100, revenue: 10000, cost: 7000 }),
        makeCustItem({ customer: "C2", qty: 0, revenue: 0, cost: 0 }),
      ];
      const { items } = calcCustomerItemCVP(data, 0);
      expect(items).toHaveLength(1);
      expect(items[0].customer).toBe("C1");
    });

    it("월별 중복 합산", () => {
      const data = [
        makeCustItem({ customer: "C1", item: "P1", qty: 50, revenue: 5000, cost: 3500 }),
        makeCustItem({ customer: "C1", item: "P1", qty: 30, revenue: 3000, cost: 2100 }),
      ];
      const { items } = calcCustomerItemCVP(data, 0);
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(80);
      expect(items[0].revenue).toBe(8000);
    });

    it("4사분면 분류 (중앙값 기준)", () => {
      const data = [
        makeCustItem({ customer: "C1", item: "P1", qty: 200, revenue: 20000, cost: 10000 }), // 고Q, 고CM
        makeCustItem({ customer: "C2", item: "P2", qty: 50, revenue: 10000, cost: 8000 }),   // 저Q, 고CM
        makeCustItem({ customer: "C3", item: "P3", qty: 200, revenue: 10000, cost: 8500 }),  // 고Q, 저CM
        makeCustItem({ customer: "C4", item: "P4", qty: 50, revenue: 5000, cost: 4500 }),    // 저Q, 저CM
      ];
      const { items } = calcCustomerItemCVP(data, 0);
      const quadrants = items.map((it) => it.quadrant);
      expect(quadrants).toContain("star");
      expect(quadrants).toContain("dog");
    });
  });

  describe("calcTotalViewSimulation — 핵심 항등식", () => {
    const baseItems = [
      makeCustItem({ customer: "C1", item: "P1", qty: 100, revenue: 10000, cost: 7000 }),
      makeCustItem({ customer: "C2", item: "P2", qty: 200, revenue: 30000, cost: 18000 }),
    ];
    const { items: cvpItems } = calcCustomerItemCVP(baseItems, 5000);

    it("무변동 시 newOP = baseOP", () => {
      const sim = calcTotalViewSimulation({
        items: cvpItems,
        totalFixedCost: 5000,
        targetCustomer: null,
        targetItem: null,
        volumeIncreasePct: 0,
        priceDecreasePct: 0,
      });
      expect(sim.newOperatingProfit).toBeCloseTo(sim.baseOperatingProfit, 0);
      expect(sim.netOffsetEffect).toBeCloseTo(0, 0);
    });

    it("대수 항등식: netOffsetEffect ≡ priceReductionLoss + volumeContributionGain (전체 대상)", () => {
      const sim = calcTotalViewSimulation({
        items: cvpItems,
        totalFixedCost: 5000,
        targetCustomer: null,
        targetItem: null,
        volumeIncreasePct: 20,
        priceDecreasePct: -10,
      });
      const decomposed = sim.priceReductionLoss + sim.volumeContributionGain;
      expect(sim.netOffsetEffect).toBeCloseTo(decomposed, 2);
    });

    it("항등식 (특정 거래처 대상)", () => {
      const sim = calcTotalViewSimulation({
        items: cvpItems,
        totalFixedCost: 5000,
        targetCustomer: "C1",
        targetItem: null,
        volumeIncreasePct: 30,
        priceDecreasePct: -15,
      });
      const decomposed = sim.priceReductionLoss + sim.volumeContributionGain;
      expect(sim.netOffsetEffect).toBeCloseTo(decomposed, 2);
    });

    it("항등식 (특정 품목 대상)", () => {
      const sim = calcTotalViewSimulation({
        items: cvpItems,
        totalFixedCost: 5000,
        targetCustomer: null,
        targetItem: "P2",
        volumeIncreasePct: 50,
        priceDecreasePct: -20,
      });
      const decomposed = sim.priceReductionLoss + sim.volumeContributionGain;
      expect(sim.netOffsetEffect).toBeCloseTo(decomposed, 2);
    });

    it("물량만 증가 시 priceReductionLoss = 0", () => {
      const sim = calcTotalViewSimulation({
        items: cvpItems,
        totalFixedCost: 5000,
        targetCustomer: null,
        targetItem: null,
        volumeIncreasePct: 20,
        priceDecreasePct: 0,
      });
      expect(sim.priceReductionLoss).toBeCloseTo(0, 2);
      expect(sim.volumeContributionGain).toBeGreaterThan(0);
      expect(sim.hypothesisValid).toBe(true);
    });

    it("단가만 인하 시 volumeContributionGain = 0", () => {
      const sim = calcTotalViewSimulation({
        items: cvpItems,
        totalFixedCost: 5000,
        targetCustomer: null,
        targetItem: null,
        volumeIncreasePct: 0,
        priceDecreasePct: -10,
      });
      expect(sim.priceReductionLoss).toBeLessThan(0);
      expect(sim.volumeContributionGain).toBeCloseTo(0, 2);
      expect(sim.hypothesisValid).toBe(false);
    });

    it("물량 증가 단위 고정비 감소", () => {
      const sim = calcTotalViewSimulation({
        items: cvpItems,
        totalFixedCost: 5000,
        targetCustomer: null,
        targetItem: null,
        volumeIncreasePct: 30,
        priceDecreasePct: 0,
      });
      expect(sim.newAvgUnitFixedCost).toBeLessThan(sim.baseAvgUnitFixedCost);
    });
  });

  describe("calcPoolSimulation — 배분 관점 항등식", () => {
    const poolData = [
      makeItemProfit({ item: "P1", qty: 100, revenue: 10000, cost: 7000, 제조고정노무비: 500, 감가상각비: 300, 기타경비: 200 }),
      makeItemProfit({ item: "P2", qty: 200, revenue: 30000, cost: 18000, 제조고정노무비: 1000, 감가상각비: 500, 기타경비: 300 }),
      makeItemProfit({ item: "P3", qty: 50, revenue: 5000, cost: 4500, 제조고정노무비: 200, 감가상각비: 100, 기타경비: 50 }),
    ];
    const { items: poolItems, poolFixedCost } = calcItemPool(poolData, "대분류", "방수");

    it("풀 구성 확인", () => {
      expect(poolItems).toHaveLength(3);
      expect(poolFixedCost).toBe(500 + 300 + 200 + 1000 + 500 + 300 + 200 + 100 + 50);
    });

    it("무변동 시 모든 품목 마진 변화 = 0", () => {
      const sim = calcPoolSimulation(poolItems, poolFixedCost, "P1", 0, 0, "revenue");
      expect(sim.targetItemMarginDelta).toBeCloseTo(0, 2);
      expect(sim.otherItemsMarginDelta).toBeCloseTo(0, 2);
      expect(sim.netPoolMarginDelta).toBeCloseTo(0, 2);
    });

    it("항등식: netPoolMarginDelta ≡ target + others", () => {
      const sim = calcPoolSimulation(poolItems, poolFixedCost, "P1", 30, -10, "revenue");
      const decomposed = sim.targetItemMarginDelta + sim.otherItemsMarginDelta;
      expect(sim.netPoolMarginDelta).toBeCloseTo(decomposed, 2);
    });

    it("대상 품목 물량 증가 시 다른 품목 장부상 고정비 감소", () => {
      const sim = calcPoolSimulation(poolItems, poolFixedCost, "P1", 50, 0, "revenue");
      // 대상 외 품목의 allocatedFixedCost가 감소해야 함
      const baseOthers = sim.baseItems.filter((it) => it.item !== "P1");
      const simOthers = sim.simulatedItems.filter((it) => it.item !== "P1");
      for (let i = 0; i < baseOthers.length; i++) {
        expect(simOthers[i].allocatedFixedCost).toBeLessThanOrEqual(baseOthers[i].allocatedFixedCost);
      }
      // 다른 품목 마진 개선
      expect(sim.otherItemsMarginDelta).toBeGreaterThanOrEqual(0);
    });

    it("매출 vs 수량 배분 결과 다름", () => {
      const simRev = calcPoolSimulation(poolItems, poolFixedCost, "P1", 30, -10, "revenue");
      const simQty = calcPoolSimulation(poolItems, poolFixedCost, "P1", 30, -10, "quantity");
      // 두 배분 방식의 구체 값은 달라야 함
      expect(simRev.targetItemMarginDelta).not.toBeCloseTo(simQty.targetItemMarginDelta, 0);
    });

    it("풀 내 고정비 총액 보존 (base)", () => {
      const sim = calcPoolSimulation(poolItems, poolFixedCost, "P1", 20, -5, "revenue");
      const baseFCSum = sim.baseItems.reduce((s, it) => s + it.allocatedFixedCost, 0);
      expect(baseFCSum).toBeCloseTo(poolFixedCost, 0);
    });

    it("풀 내 고정비 총액 보존 (simulated)", () => {
      const sim = calcPoolSimulation(poolItems, poolFixedCost, "P1", 20, -5, "revenue");
      const simFCSum = sim.simulatedItems.reduce((s, it) => s + it.allocatedFixedCost, 0);
      expect(simFCSum).toBeCloseTo(poolFixedCost, 0);
    });
  });

  describe("verifyIntegrity — 내부 항등식 검증", () => {
    const baseItems = [
      makeCustItem({ customer: "C1", item: "P1", qty: 100, revenue: 10000, cost: 7000 }),
      makeCustItem({ customer: "C2", item: "P2", qty: 200, revenue: 30000, cost: 18000 }),
    ];
    const poolData = [
      makeItemProfit({ item: "P1", qty: 100, revenue: 10000, cost: 7000 }),
      makeItemProfit({ item: "P2", qty: 200, revenue: 30000, cost: 18000 }),
    ];

    it("모든 시나리오에서 4a, 4b 내부 항등식 성립", () => {
      const { items: cvpItems } = calcCustomerItemCVP(baseItems, 5000);
      const { items: poolItems, poolFixedCost } = calcItemPool(poolData, "대분류", "방수");

      const scenarios = [
        { v: 0, p: 0 },
        { v: 20, p: 0 },
        { v: 0, p: -10 },
        { v: 30, p: -10 },
        { v: 50, p: -15 },
        { v: -10, p: -5 },
      ];

      for (const { v, p } of scenarios) {
        const totalSim = calcTotalViewSimulation({
          items: cvpItems,
          totalFixedCost: 5000,
          targetCustomer: null,
          targetItem: "P1",
          volumeIncreasePct: v,
          priceDecreasePct: p,
        });
        const poolSim = calcPoolSimulation(poolItems, poolFixedCost, "P1", v, p, "revenue");
        const integrity = verifyIntegrity(totalSim, poolSim);
        expect(integrity.totalViewIsConsistent).toBe(true);
        expect(integrity.poolIsConsistent).toBe(true);
        expect(integrity.isConsistent).toBe(true);
      }
    });
  });

  describe("calcWaterfallSteps", () => {
    it("4단계 생성", () => {
      const baseItems = [makeCustItem({ qty: 100, revenue: 10000, cost: 7000 })];
      const { items } = calcCustomerItemCVP(baseItems, 1000);
      const sim = calcTotalViewSimulation({
        items,
        totalFixedCost: 1000,
        targetCustomer: null,
        targetItem: null,
        volumeIncreasePct: 20,
        priceDecreasePct: -5,
      });
      const steps = calcWaterfallSteps(sim);
      expect(steps).toHaveLength(4);
      expect(steps[0].name).toBe("기존 영업이익");
      expect(steps[1].name).toBe("단가 인하 손실");
      expect(steps[2].name).toBe("물량 증가 공헌");
      expect(steps[3].name).toBe("최종 영업이익");
    });

    it("cumulative 합산 일관성", () => {
      const baseItems = [makeCustItem({ qty: 100, revenue: 10000, cost: 7000 })];
      const { items } = calcCustomerItemCVP(baseItems, 1000);
      const sim = calcTotalViewSimulation({
        items,
        totalFixedCost: 1000,
        targetCustomer: null,
        targetItem: null,
        volumeIncreasePct: 10,
        priceDecreasePct: -5,
      });
      const steps = calcWaterfallSteps(sim);
      expect(steps[0].cumulative).toBeCloseTo(sim.baseOperatingProfit, 0);
      expect(steps[3].cumulative).toBeCloseTo(sim.newOperatingProfit, 0);
    });
  });
});
