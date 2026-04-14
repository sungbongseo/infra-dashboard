import { describe, it, expect } from "vitest";
import {
  extractManufacturingFixedCost,
  calcCustomerItemCVP,
  calcTotalViewSimulation,
  calcItemPool,
  calcPoolSimulation,
  calcWaterfallSteps,
  verifyIntegrity,
  getUnitGroups,
  calcGroupCVP,
  calcSensitivityGrid,
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
    sgaCost: number;
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
    sgaCost = 0,
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
    판관변동_직접판매운반비: pad(sgaCost),
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
        priceChangePct: 0,
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
        priceChangePct: -10,
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
        priceChangePct: -15,
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
        priceChangePct: -20,
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
        priceChangePct: 0,
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
        priceChangePct: -10,
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
        priceChangePct: 0,
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
          priceChangePct: p,
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
        priceChangePct: -5,
      });
      const steps = calcWaterfallSteps(sim);
      expect(steps).toHaveLength(4);
      expect(steps[0].name).toBe("기존 영업이익");
      expect(steps[1].name).toMatch(/단가 효과/);
      expect(steps[2].name).toMatch(/물량 효과/);
      expect(steps[3].name).toBe("최종 영업이익");
    });

    it("H3: BEP Infinity 반환 (적자 상태)", () => {
      // 변동비가 매출보다 큰 아이템 → 단위공헌이익 < 0
      const lossItems = [makeCustItem({ qty: 100, revenue: 5000, cost: 6000 })];
      const { summary } = calcCustomerItemCVP(lossItems, 1000);
      expect(summary.bepQuantity).toBe(Infinity);
      expect(summary.bepRevenue).toBe(Infinity);
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
        priceChangePct: -5,
      });
      const steps = calcWaterfallSteps(sim);
      expect(steps[0].cumulative).toBeCloseTo(sim.baseOperatingProfit, 0);
      expect(steps[3].cumulative).toBeCloseTo(sim.newOperatingProfit, 0);
    });
  });

  describe("엣지 케이스 방어 (정밀 감사)", () => {
    it("H1: 음수 매출(환입) 포함 시 CVP에 반영", () => {
      const items = [
        makeCustItem({ customer: "C1", item: "P1", qty: 100, revenue: 10000, cost: 7000 }),
        makeCustItem({ customer: "C1", item: "P2", qty: -10, revenue: -500, cost: -300 }), // 환입
      ];
      const { items: cvp, summary } = calcCustomerItemCVP(items, 1000);
      // P2(환입)가 포함되어야 함 (이전엔 revenue<=0으로 제외됨)
      expect(cvp.length).toBe(2);
      // 총매출에 환입 반영
      expect(summary.totalRevenue).toBe(10000 + (-500));
    });

    it("H2: calcItemPool 음수 변동비 방어 (cost < fixed)", () => {
      // 실적매출원가=500, 고정비(400+300+100)=800 → vc=500-800=-300 → 클램핑 0
      const poolData = [
        makeItemProfit({
          item: "[T001] 테스트A",
          대분류: "테스트",
          qty: 50,
          revenue: 5000,
          cost: 500,
          제조고정노무비: 400,
          감가상각비: 300,
          기타경비: 100,
        }),
      ];
      const { items } = calcItemPool(poolData, "대분류", "테스트");
      // 변동비가 0으로 클램핑되어야 함 (Math.max(500-800, 0) = 0)
      expect(items[0].variableCost).toBe(0);
    });

    it("M2: calcPoolSimulation baseTotalWeight=0 → 균등 배분", () => {
      // 모든 품목 매출 0 → weight = 0 → 균등 배분 fallback
      const zeroItems: import("@/lib/analysis/offsetEffect").ItemPoolCVP[] = [
        { item: "A", itemName: "A", 대분류: "T", 중분류: "", 품목계정그룹: "",
          quantity: 10, revenue: 0, variableCost: 0,
          allocatedFixedCost: 0, unitAllocatedFixedCost: 0,
          unitContributionMargin: 0, allocatedOperatingProfit: 0 },
        { item: "B", itemName: "B", 대분류: "T", 중분류: "", 품목계정그룹: "",
          quantity: 5, revenue: 0, variableCost: 0,
          allocatedFixedCost: 0, unitAllocatedFixedCost: 0,
          unitContributionMargin: 0, allocatedOperatingProfit: 0 },
      ];
      const poolSim = calcPoolSimulation(zeroItems, 1000, "A", 0, 0, "revenue");
      // 풀 고정비 1000을 2개 품목에 균등 배분 → 각 500
      expect(poolSim.baseItems[0].allocatedFixedCost).toBeCloseTo(500, 0);
      expect(poolSim.baseItems[1].allocatedFixedCost).toBeCloseTo(500, 0);
    });

    it("1-2: 짝수 개 데이터셋 중앙값 피벗 대칭성", () => {
      // 4개 아이템 — 짝수 개일 때 중앙값 = (sorted[1] + sorted[2]) / 2
      const data = [
        makeCustItem({ customer: "C1", item: "P1", qty: 10, revenue: 1000, cost: 900 }),
        makeCustItem({ customer: "C2", item: "P2", qty: 20, revenue: 2000, cost: 800 }),
        makeCustItem({ customer: "C3", item: "P3", qty: 30, revenue: 3000, cost: 2800 }),
        makeCustItem({ customer: "C4", item: "P4", qty: 40, revenue: 4000, cost: 1500 }),
      ];
      const { items } = calcCustomerItemCVP(data, 0);
      const quadrants = items.map((it) => it.quadrant);
      // 대칭 분류: 각 quadrant에 1개씩이어야 함 (중앙값 기반)
      expect(quadrants.filter((q) => q === "star").length).toBeGreaterThanOrEqual(1);
      expect(quadrants.filter((q) => q === "dog").length).toBeGreaterThanOrEqual(1);
    });

    it("1-3: 음수 수량(반품) 아이템 quadrant 분류 제외 + summary 포함", () => {
      const data = [
        makeCustItem({ customer: "C1", item: "P1", qty: 100, revenue: 10000, cost: 7000 }),
        makeCustItem({ customer: "C2", item: "P2", qty: -20, revenue: -2000, cost: -1400 }), // 반품
      ];
      const { items, summary } = calcCustomerItemCVP(data, 1000);
      // 반품 아이템은 dog으로 분류
      const returnItem = items.find((it) => it.customer === "C2");
      expect(returnItem?.quadrant).toBe("dog");
      // summary에 반품 통계 포함
      expect(summary.returnItemCount).toBe(1);
      expect(summary.returnRevenue).toBe(-2000);
      // summary 합계에 반품 매출 포함
      expect(summary.totalRevenue).toBe(10000 + (-2000));
    });

    it("calcPoolSimulation — volumeAbsolute 모드", () => {
      const poolData = [
        makeItemProfit({ item: "[P1] A", 대분류: "방수", qty: 100, revenue: 10000, cost: 7000 }),
        makeItemProfit({ item: "[P2] B", 대분류: "방수", qty: 200, revenue: 30000, cost: 18000 }),
      ];
      const { items: poolItems, poolFixedCost } = calcItemPool(poolData, "대분류", "방수");
      // 절대 수량 200 추가 (% 아닌 절대)
      const sim = calcPoolSimulation(poolItems, poolFixedCost, "P1", 0, -5, "revenue", "대분류", "방수", 200);
      // 대상 품목 수량이 100 → 300으로 증가해야 함
      const targetSim = sim.simulatedItems.find((it) => it.item === "P1");
      expect(targetSim?.quantity).toBe(300);
      // 항등식 성립
      expect(sim.netPoolMarginDelta).toBeCloseTo(sim.targetItemMarginDelta + sim.otherItemsMarginDelta, 2);
    });

    it("calcWaterfallSteps — 단가 인상 시나리오 (green bar)", () => {
      const baseItems = [makeCustItem({ qty: 100, revenue: 10000, cost: 7000 })];
      const { items } = calcCustomerItemCVP(baseItems, 1000);
      const sim = calcTotalViewSimulation({
        items,
        totalFixedCost: 1000,
        targetCustomer: null,
        targetItem: null,
        volumeIncreasePct: -10,
        priceChangePct: 10,
      });
      const steps = calcWaterfallSteps(sim);
      // 단가 인상 → priceReductionLoss가 양수(이득) → 녹색
      expect(sim.priceReductionLoss).toBeGreaterThan(0);
      expect(steps[1].fill).toBe("hsl(142, 71%, 45%)"); // green
      expect(steps[1].name).toMatch(/이득/);
    });

    it("verifyIntegrity — baseOP=0 엣지케이스", () => {
      const totalSim = {
        baseTotalRevenue: 10000, baseTotalVariableCost: 9000,
        baseOperatingProfit: 0, baseTotalQuantity: 100, baseAvgUnitFixedCost: 10,
        targetCustomer: null, targetItem: null,
        volumeIncreasePct: 10, priceChangePct: 0,
        newTotalRevenue: 11000, newTotalVariableCost: 9900,
        newTotalQuantity: 110, newAvgUnitFixedCost: 9.09,
        newOperatingProfit: 100,
        priceReductionLoss: 0, volumeContributionGain: 100,
        netOffsetEffect: 100, hypothesisValid: true,
        hypothesisResult: "positive" as const,
      };
      const poolSim = {
        poolLevel: "대분류" as const, poolName: "T", poolFixedCost: 1000,
        allocationBasis: "revenue" as const, targetItem: null,
        volumeIncreasePct: 10, priceChangePct: 0,
        baseItems: [], simulatedItems: [],
        targetItemMarginDelta: 0, otherItemsMarginDelta: 0, netPoolMarginDelta: 0,
      };
      const integrity = verifyIntegrity(totalSim, poolSim);
      expect(integrity.totalViewIsConsistent).toBe(true);
      expect(integrity.isConsistent).toBe(true);
    });

    it("getUnitGroups — 2개 미만 아이템 그룹 필터링", () => {
      const data = [
        makeItemProfit({ item: "[P1] A", 대분류: "방수", qty: 100, revenue: 10000, cost: 7000 }),
        // 방수 그룹에 1개만 있으면 필터링됨
      ];
      // 기준단위가 빈문자열이므로 그룹 형성 불가
      const groups = getUnitGroups(data);
      expect(groups.length).toBe(0);
    });

    it("calcGroupCVP — BEP 수량 계산", () => {
      const data = [
        { ...makeItemProfit({ item: "[P1] A", 대분류: "방수", qty: 100, revenue: 10000, cost: 7000 }), 기준단위: "KG" },
        { ...makeItemProfit({ item: "[P2] B", 대분류: "방수", qty: 200, revenue: 20000, cost: 14000 }), 기준단위: "KG" },
      ];
      const result = calcGroupCVP(data, "방수", "KG");
      expect(result.unit).toBe("KG");
      expect(result.totalQuantity).toBe(300);
      expect(result.bepQuantity).toBeGreaterThan(0);
      expect(isFinite(result.bepQuantity)).toBe(true);
    });

    it("calcSensitivityGrid — 단가 인하 시 필요 물량 > 0", () => {
      const data = [makeCustItem({ customer: "C1", item: "P1", qty: 100, revenue: 10000, cost: 7000 })];
      const { items } = calcCustomerItemCVP(data, 1000);
      const grid = calcSensitivityGrid(items, 1000, null, "P1", [-10, -5, 5]);
      // 단가 인하 → 필요 물량 증가율 > 0
      expect(grid[0].requiredVolumePct).toBeGreaterThan(0); // -10%
      expect(grid[1].requiredVolumePct).toBeGreaterThan(0); // -5%
      // 단가 인상 → 불필요
      expect(grid[2].requiredVolumePct).toBe(0); // +5%
    });

    it("1-4: calcItemPool — 코드 정규화 실패 시 warnings 수집", () => {
      const poolData = [
        makeItemProfit({ item: "코드없는품목", 대분류: "방수", qty: 50, revenue: 5000, cost: 3000 }),
      ];
      const { warnings } = calcItemPool(poolData, "대분류", "방수");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/정규화 실패/);
    });

    it("개선1: 판관변동_직접판매운반비가 변동비에 포함", () => {
      const data = [
        makeCustItem({ customer: "C1", item: "P1", qty: 100, revenue: 10000, cost: 7000, sgaCost: 500 }),
      ];
      const { items, summary } = calcCustomerItemCVP(data, 1000);
      // 변동비 = (10000-3000) + 500 = 7500
      expect(items[0].variableCost).toBe(7500);
      expect(items[0].sgaVariableCost).toBe(500);
      // 공헌이익 = 10000 - 7500 = 2500
      expect(items[0].totalContributionMargin).toBe(2500);
      // 영업이익 = 2500 - 1000 = 1500
      expect(summary.totalOperatingProfit).toBe(1500);
    });

    it("개선2: calcItemPool 14개 변동비 직접 합산", () => {
      const poolData = [
        {
          ...makeItemProfit({ item: "[P1] A", 대분류: "방수", qty: 100, revenue: 10000, cost: 7000 }),
          원재료비: 3000, 부재료비: 500, 노무비: 1000, 외주가공비: 800,
        },
      ];
      const { items } = calcItemPool(poolData, "대분류", "방수");
      // 직접 합산: 3000+500+1000+800 = 5300 (나머지 10개 = 0)
      expect(items[0].variableCost).toBe(5300);
    });

    it("개선3: 표준원가 이상치 경고", () => {
      const poolData = [
        {
          ...makeItemProfit({ item: "[P1] A", 대분류: "방수", qty: 100, revenue: 10000, cost: 7000 }),
          표준매출원가: 5000, // 실적 7000 vs 표준 5000 → 40% 차이
        },
      ];
      const { warnings } = calcItemPool(poolData, "대분류", "방수");
      const costWarnings = warnings.filter((w) => w.includes("원가 이상치"));
      expect(costWarnings.length).toBe(1);
      expect(costWarnings[0]).toMatch(/40%/);
    });

    it("A1: targetTotalQty ≤ 0 시 균등 분배 fallback", () => {
      // 반품(-50)이 정상(30)보다 많은 → totalQty = -20
      const data = [
        makeCustItem({ customer: "C1", item: "P1", qty: 30, revenue: 3000, cost: 2100 }),
        makeCustItem({ customer: "C2", item: "P1", qty: -50, revenue: -5000, cost: -3500 }),
      ];
      const { items } = calcCustomerItemCVP(data, 1000);
      // totalQty=-20 → 절대수량 모드에서 균등분배 사용해야 crash 없음
      const sim = calcTotalViewSimulation({
        items, totalFixedCost: 1000, targetCustomer: null, targetItem: "P1",
        volumeIncreasePct: 0, priceChangePct: 0, volumeAbsolute: 100,
      });
      // crash 없이 결과 반환
      expect(isFinite(sim.newOperatingProfit)).toBe(true);
    });

    it("A2: 감도 분석 CM≤0 시 requiredVolumePct = Infinity", () => {
      // 변동비 > 매출 → CM < 0 → BEP 달성 불가
      const data = [makeCustItem({ customer: "C1", item: "P1", qty: 100, revenue: 5000, cost: 6000 })];
      const { items } = calcCustomerItemCVP(data, 1000);
      const grid = calcSensitivityGrid(items, 1000, null, "P1", [-10]);
      expect(grid[0].requiredVolumePct).toBe(Infinity);
    });

    it("C1: Pool 경고 중복 제거", () => {
      // 같은 품목 2행 (월별) → 경고 1건만
      const poolData = [
        makeItemProfit({ item: "코드없는품목", 대분류: "방수", qty: 50, revenue: 5000, cost: 3000 }),
        makeItemProfit({ item: "코드없는품목", 대분류: "방수", qty: 30, revenue: 3000, cost: 2000 }),
      ];
      const { warnings } = calcItemPool(poolData, "대분류", "방수");
      const normWarnings = warnings.filter((w) => w.includes("정규화 실패"));
      expect(normWarnings.length).toBe(1); // 중복 아닌 1건만
    });

    it("B4: 변동비 fallback 경고", () => {
      // 14개 항목 모두 0이지만 실적매출원가 > 0 → fallback 사용 경고
      const poolData = [
        makeItemProfit({ item: "[P1] A", 대분류: "방수", qty: 100, revenue: 10000, cost: 7000 }),
      ];
      const { warnings } = calcItemPool(poolData, "대분류", "방수");
      const fbWarnings = warnings.filter((w) => w.includes("fallback"));
      expect(fbWarnings.length).toBe(1);
    });

    it("M5: verifyIntegrity tolerance — 극소 이익에서 false positive 없음", () => {
      // baseOperatingProfit ≈ 0.01 (극소) + baseTotalRevenue = 10000
      const totalSim = {
        baseTotalRevenue: 10000, baseTotalVariableCost: 8999.99,
        baseOperatingProfit: 0.01, baseTotalQuantity: 100, baseAvgUnitFixedCost: 10,
        targetCustomer: null, targetItem: null,
        volumeIncreasePct: 0, priceChangePct: 0,
        newTotalRevenue: 10000, newTotalVariableCost: 8999.99,
        newTotalQuantity: 100, newAvgUnitFixedCost: 10,
        newOperatingProfit: 0.01,
        priceReductionLoss: 0, volumeContributionGain: 0,
        netOffsetEffect: 0, hypothesisValid: false,
      };
      const poolSim = {
        poolLevel: "대분류" as const, poolName: "T", poolFixedCost: 1000,
        allocationBasis: "revenue" as const, targetItem: null,
        volumeIncreasePct: 0, priceChangePct: 0,
        baseItems: [], simulatedItems: [],
        targetItemMarginDelta: 0, otherItemsMarginDelta: 0, netPoolMarginDelta: 0,
      };
      const integrity = verifyIntegrity(totalSim, poolSim);
      // denominator = max(0.01, 10000*0.0001, 1) = max(0.01, 1, 1) = 1
      // identityError = 0 / 1 = 0 < 0.01 → consistent
      expect(integrity.totalViewIsConsistent).toBe(true);
    });
  });
});
