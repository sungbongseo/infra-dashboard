import { describe, it, expect } from "vitest";
import { calcWhatIfScenario, calcScenarioSummary, calcSensitivity } from "./whatif";
import type { OrgProfitRecord, PlanActualDiff } from "@/types";

const pad = (v: number): PlanActualDiff => ({ 계획: v, 실적: v, 차이: 0 });
const pad0 = (): PlanActualDiff => ({ 계획: 0, 실적: 0, 차이: 0 });

function makeOrg(overrides: Partial<OrgProfitRecord> = {}): OrgProfitRecord {
  return {
    No: 1, 판매사업본부: "", 판매사업부: "", 영업조직팀: "팀A",
    매출액: pad(1000), 실적매출원가: pad(700), 매출총이익: pad(300),
    판관변동_직접판매운반비: pad0(), 판관변동_운반비: pad0(), 판매관리비: pad(100), 영업이익: pad(200),
    공헌이익: pad(400), 매출원가율: pad(70), 매출총이익율: pad(30),
    판관비율: pad(10), 영업이익율: pad(20), 공헌이익율: pad(40),
    ...overrides,
  };
}

describe("whatif", () => {
  describe("calcWhatIfScenario", () => {
    it("매출 +10% 시나리오", () => {
      const result = calcWhatIfScenario([makeOrg()], {
        salesChangePercent: 10, costRateChangePoints: 0, sgaChangePercent: 0,
      });
      expect(result).toHaveLength(1);
      expect(result[0].scenarioSales).toBeCloseTo(1100, 0);
      // costRate 70% → scenarioCost = 1100 * 0.7 = 770
      // scenarioGP = 1100 - 770 = 330
      // scenarioSGA = 100 (unchanged) → scenarioOP = 230
      expect(result[0].scenarioOperatingProfit).toBeCloseTo(230, 0);
    });

    it("음수 판관비(SAP 반제) 허용 — Math.max(0) 제거됨", () => {
      const org = makeOrg({ 판매관리비: pad(-50) }); // 반제 전표로 음수
      const result = calcWhatIfScenario([org], {
        salesChangePercent: 0, costRateChangePoints: 0, sgaChangePercent: 0,
      });
      // SGA = -50 * (1 + 0) = -50 (음수 허용)
      // scenarioOP = 300 - (-50) = 350
      expect(result[0].scenarioOperatingProfit).toBeCloseTo(350, 0);
    });

    it("원가율 +3pp 시나리오", () => {
      const result = calcWhatIfScenario([makeOrg()], {
        salesChangePercent: 0, costRateChangePoints: 3, sgaChangePercent: 0,
      });
      // costRate = 70 + 3 = 73% → cost = 1000 * 0.73 = 730
      // GP = 1000 - 730 = 270, SGA = 100, OP = 170
      expect(result[0].scenarioOperatingProfit).toBeCloseTo(170, 0);
    });

    it("빈 데이터 → 빈 결과", () => {
      expect(calcWhatIfScenario([], { salesChangePercent: 10, costRateChangePoints: 0, sgaChangePercent: 0 })).toHaveLength(0);
    });

    it("매출 0인 조직 포함해도 오류 없음", () => {
      const data = [makeOrg({ 매출액: pad(0) })];
      const result = calcWhatIfScenario(data, {
        salesChangePercent: 10, costRateChangePoints: 0, sgaChangePercent: 0,
      });
      expect(result).toHaveLength(1);
      expect(result[0].scenarioSales).toBe(0);
    });
  });

  describe("calcScenarioSummary", () => {
    it("가중평균 마진 계산", () => {
      const results = calcWhatIfScenario(
        [makeOrg({ 영업조직팀: "A" }), makeOrg({ 영업조직팀: "B", 매출액: pad(2000), 매출원가율: pad(80) })],
        { salesChangePercent: 0, costRateChangePoints: 0, sgaChangePercent: 0 }
      );
      const summary = calcScenarioSummary(results);
      expect(summary.scenarioTotalSales).toBe(3000);
      expect(summary.scenarioAvgMargin).toBeDefined();
    });
  });

  describe("calcSensitivity", () => {
    it("매출 변동 감도 분석", () => {
      const points = calcSensitivity([makeOrg()], "sales", [-10, 0, 10]);
      expect(points).toHaveLength(3);
      expect(points[1].operatingProfit).toBeCloseTo(200, 0); // base
      expect(points[2].operatingProfit).toBeGreaterThan(200); // +10%
      expect(points[0].operatingProfit).toBeLessThan(200); // -10%
    });

    it("빈 범위 → 빈 결과", () => {
      expect(calcSensitivity([makeOrg()], "sales", [])).toHaveLength(0);
    });
  });
});
