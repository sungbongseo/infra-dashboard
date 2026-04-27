import { describe, it, expect } from "vitest";
import {
  calcCustomerLTVImpact,
  buildLTVMap,
  buildChurnMap,
  ltvConfidenceLabel,
  riskLevelLabel,
  MAX_CHURN_REDUCTION_PCT,
} from "./customerLTV";
import type { ClvResult } from "./clv";
import type { ChurnRiskCustomer } from "./churnPrediction";

function mkClv(o: Partial<ClvResult>): ClvResult {
  return {
    customer: "C1",
    customerName: "Cust 1",
    avgTransactionValue: 0,
    purchaseFrequency: 0,
    customerValue: 0,
    avgProfitMargin: 0,
    estimatedLifespan: 0,
    clv: 0,
    currentSales: 0,
    clvToSalesRatio: 0,
    confidence: "normal",
    ...o,
  };
}

function mkChurn(o: Partial<ChurnRiskCustomer>): ChurnRiskCustomer {
  return {
    customer: "C1",
    customerName: "Cust 1",
    lastPurchaseMonth: "",
    monthsSinceLastPurchase: 0,
    purchaseFrequency: 0,
    avgMonthlyAmount: 0,
    totalAmount: 0,
    churnScore: 0,
    riskLevel: "low",
    signals: [],
    ...o,
  };
}

describe("calcCustomerLTVImpact", () => {
  describe("정상 케이스", () => {
    it("baseLTV 1,000만 × 인하 5% × churn 80 → 수용 +40만, 거절 -40만", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 10_000_000 })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 80, riskLevel: "high" })]);
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -5, ltvMap, churnMap });
      expect(r.acceptImpact).toBeCloseTo(400_000, 0); // 1000만 × 0.05 × 0.8
      expect(r.rejectImpact).toBeCloseTo(-400_000, 0);
      expect(r.confidence).toBe("normal");
    });

    it("churn 100 (확정 이탈) → 수용 효과 = baseLTV × 인하율", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C2", clv: 1_000_000 })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C2", churnScore: 100, riskLevel: "critical" })]);
      const r = calcCustomerLTVImpact({ customer: "C2", priceChangePct: -10, ltvMap, churnMap });
      expect(r.acceptImpact).toBeCloseTo(100_000, 0); // 100만 × 0.10 × 1.0
    });

    it("churn 0 (안정) → 수용 효과 0", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 1_000_000 })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 0 })]);
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -5, ltvMap, churnMap });
      expect(r.acceptImpact).toBe(0);
    });
  });

  describe("부호 처리", () => {
    it("priceChangePct >= 0 (인상) → 수용 효과 0 (저가수주 아님)", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 1_000_000 })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 80 })]);
      expect(calcCustomerLTVImpact({ customer: "C1", priceChangePct: 5, ltvMap, churnMap }).acceptImpact).toBe(0);
      expect(calcCustomerLTVImpact({ customer: "C1", priceChangePct: 0, ltvMap, churnMap }).acceptImpact).toBe(0);
    });

    it("acceptImpact / rejectImpact 항상 mirror image", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 5_000_000 })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 50 })]);
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -7, ltvMap, churnMap });
      expect(r.acceptImpact + r.rejectImpact).toBeCloseTo(0, 6);
    });
  });

  describe("극단값 클램핑", () => {
    it("인하 100% → churn 감소 50% 클램핑", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 1_000_000 })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 100 })]);
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -100, ltvMap, churnMap });
      expect(r.churnReductionPct).toBe(MAX_CHURN_REDUCTION_PCT);
      expect(r.acceptImpact).toBeCloseTo(500_000, 0); // 100만 × 0.5 × 1
      expect(r.notes.some(n => n.includes("클램핑"))).toBe(true);
    });

    it("baseLTV 0 → 모든 영향 0", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 0 })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 80 })]);
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -10, ltvMap, churnMap });
      expect(r.acceptImpact).toBe(0);
      expect(r.rejectImpact).toBe(0);
    });
  });

  describe("신뢰도 전파", () => {
    it("LTV 데이터 없음 → insufficient", () => {
      const ltvMap = new Map<string, ClvResult>();
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 50 })]);
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -5, ltvMap, churnMap });
      expect(r.confidence).toBe("insufficient");
      expect(r.baseLTV).toBe(0);
      expect(r.notes).toContain("LTV 데이터 없음");
    });

    it("LTV confidence=insufficient → insufficient 전파", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 1_000_000, confidence: "insufficient" })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 50 })]);
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -5, ltvMap, churnMap });
      expect(r.confidence).toBe("insufficient");
    });

    it("LTV confidence=low + churn 정상 → low", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 1_000_000, confidence: "low" })]);
      const churnMap = buildChurnMap([mkChurn({ customer: "C1", churnScore: 50 })]);
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -5, ltvMap, churnMap });
      expect(r.confidence).toBe("low");
    });

    it("Churn 데이터 없음 → low로 강등", () => {
      const ltvMap = buildLTVMap([mkClv({ customer: "C1", clv: 1_000_000, confidence: "normal" })]);
      const churnMap = new Map<string, ChurnRiskCustomer>();
      const r = calcCustomerLTVImpact({ customer: "C1", priceChangePct: -5, ltvMap, churnMap });
      expect(r.confidence).toBe("low");
      expect(r.notes.some(n => n.includes("이탈 위험"))).toBe(true);
    });
  });

  describe("UI 헬퍼", () => {
    it("ltvConfidenceLabel 한국어", () => {
      expect(ltvConfidenceLabel("normal")).toContain("정상");
      expect(ltvConfidenceLabel("low")).toContain("낮음");
      expect(ltvConfidenceLabel("insufficient")).toContain("부족");
    });

    it("riskLevelLabel 한국어", () => {
      expect(riskLevelLabel("critical")).toBe("긴급");
      expect(riskLevelLabel("high")).toBe("높음");
      expect(riskLevelLabel(null)).toBe("추정 불가");
    });
  });

  describe("Map 빌더", () => {
    it("buildLTVMap 키-값 매핑", () => {
      const m = buildLTVMap([
        mkClv({ customer: "A", clv: 100 }),
        mkClv({ customer: "B", clv: 200 }),
      ]);
      expect(m.size).toBe(2);
      expect(m.get("A")!.clv).toBe(100);
    });

    it("buildChurnMap 키-값 매핑", () => {
      const m = buildChurnMap([
        mkChurn({ customer: "X", churnScore: 30 }),
        mkChurn({ customer: "Y", churnScore: 90 }),
      ]);
      expect(m.size).toBe(2);
      expect(m.get("Y")!.churnScore).toBe(90);
    });
  });
});
