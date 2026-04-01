import { describe, it, expect } from "vitest";
import { calcSensitivityGrid, generateSensitivityInsight } from "./sensitivityAnalysis";

describe("sensitivityAnalysis", () => {
  describe("calcSensitivityGrid", () => {
    it("기본 그리드 생성 (11×11 = 121 셀)", () => {
      const result = calcSensitivityGrid(1000, 300, 200);
      expect(result.grid).toHaveLength(121); // 11 price × 11 volume
      expect(result.baseSales).toBe(1000);
      expect(result.baseGrossProfit).toBe(300);
      expect(result.baseOpProfit).toBe(200);
    });

    it("기준점(0%, 0%)에서 변동률 0", () => {
      const result = calcSensitivityGrid(1000, 300, 200);
      const baseCell = result.grid.find(c => c.priceChange === 0 && c.volumeChange === 0);
      expect(baseCell).toBeDefined();
      expect(baseCell!.salesChange).toBeCloseTo(0, 5);
      expect(baseCell!.gpChange).toBeCloseTo(0, 5);
      expect(baseCell!.opChange).toBeCloseTo(0, 5);
    });

    it("가격 +10% → 매출 +10% (물량 동일)", () => {
      const result = calcSensitivityGrid(1000, 300, 200);
      const cell = result.grid.find(c => c.priceChange === 10 && c.volumeChange === 0);
      expect(cell!.resultSales).toBeCloseTo(1100, 0);
      // COGS 변동 없음 (가격만 변동) → GP = 1100 - 700 = 400
      expect(cell!.resultGrossProfit).toBeCloseTo(400, 0);
    });

    it("물량 +10% → COGS도 +10% (가격 동일)", () => {
      const result = calcSensitivityGrid(1000, 300, 200);
      const cell = result.grid.find(c => c.priceChange === 0 && c.volumeChange === 10);
      expect(cell!.resultSales).toBeCloseTo(1100, 0);
      // COGS = 700 * 1.1 = 770 → GP = 1100 - 770 = 330
      expect(cell!.resultGrossProfit).toBeCloseTo(330, 0);
    });

    it("SGA 변동비율 반영 확인", () => {
      // sgaVarRatio=0.5: SGA 50% 고정, 50% 변동
      const result = calcSensitivityGrid(1000, 300, 200, [-10, 0, 10], [-10, 0, 10], 0.5);
      const cell = result.grid.find(c => c.priceChange === 0 && c.volumeChange === 10);
      // SGA = baseSGA(100) * 0.5 + 100 * 0.5 * 1.1 = 50 + 55 = 105
      // GP = 330 (from above), OP = 330 - 105 = 225
      expect(cell!.resultOpProfit).toBeCloseTo(225, 0);
    });

    it("baseSales 0 → 변동률 0 (division-by-zero 안전)", () => {
      const result = calcSensitivityGrid(0, 0, 0);
      expect(result.grid.every(c => c.salesChange === 0)).toBe(true);
    });

    it("crossAnalysis 생성", () => {
      const result = calcSensitivityGrid(1000, 300, 200);
      expect(result.crossAnalysis).toBeDefined();
      expect(result.crossAnalysis!.length).toBeGreaterThan(0);
      // 물량 +5% 시 가격 인하 허용 범위가 존재해야 함
      expect(result.crossAnalysis![0].maxPriceReduction).toBeGreaterThanOrEqual(0);
    });
  });

  describe("generateSensitivityInsight", () => {
    it("영업이익 기준 인사이트 생성", () => {
      const result = calcSensitivityGrid(1000, 300, 200);
      const insight = generateSensitivityInsight(result, "op");
      expect(insight.dominantFactor).toMatch(/price|volume|balanced/);
      expect(insight.recommendation).toBeTruthy();
      expect(insight.riskWarning).toBeTruthy();
    });

    it("priceImpact와 volumeImpact 모두 유한한 숫자", () => {
      const result = calcSensitivityGrid(1000, 300, 200);
      const insight = generateSensitivityInsight(result, "op");
      expect(isFinite(insight.priceImpact10)).toBe(true);
      expect(isFinite(insight.volumeImpact10)).toBe(true);
    });
  });
});
