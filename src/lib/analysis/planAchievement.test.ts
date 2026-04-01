import { describe, it, expect } from "vitest";
import {
  calcPlanAchievementSummary,
  calcOrgAchievement,
  calcTopContributors,
  calcMarginDrift,
  checkPlanDataQuality,
  generatePlanInsight,
} from "./planAchievement";
import type { ProfitabilityAnalysisRecord, PlanActualDiff } from "@/types";

const pad = (plan: number, actual: number): PlanActualDiff => ({
  계획: plan, 실적: actual, 차이: actual - plan,
});
const pad0 = (): PlanActualDiff => ({ 계획: 0, 실적: 0, 차이: 0 });

function makeRecord(overrides: Partial<ProfitabilityAnalysisRecord> = {}): ProfitabilityAnalysisRecord {
  return {
    No: 1, 영업조직팀: "팀A", 영업담당사번: "E001", 매출거래처: "C001", 품목: "P001",
    제품내수매출: pad0(), 제품수출매출: pad0(), 매출수량: pad0(), 품목명: "",
    매출액: pad(1000, 900), 실적매출원가: pad(700, 650),
    매출총이익: pad(300, 250), 판매관리비: pad(100, 100),
    영업이익: pad(200, 150), 매출원가율: pad(70, 72),
    매출총이익율: pad(30, 28), 판관비율: pad(10, 11),
    영업이익율: pad(20, 17), 공헌이익율: pad(40, 38),
    ...overrides,
  } as ProfitabilityAnalysisRecord;
}

describe("planAchievement", () => {
  describe("calcPlanAchievementSummary", () => {
    it("달성율 및 마진 드리프트 계산", () => {
      const data = [makeRecord()];
      const result = calcPlanAchievementSummary(data);
      expect(result.salesAchievement).toBeCloseTo(90, 0); // 900/1000*100
      expect(result.salesGap).toBe(-100);
      expect(result.marginDrift).toBeCloseTo(-2, 0); // 28% - 30%
    });

    it("계획 0 → 달성율 null", () => {
      const data = [makeRecord({ 매출액: pad(0, 500) })];
      const result = calcPlanAchievementSummary(data);
      expect(result.salesAchievement).toBeNull();
    });
  });

  describe("calcOrgAchievement", () => {
    it("조직별 그룹핑", () => {
      const data = [
        makeRecord({ 영업조직팀: "A" }),
        makeRecord({ 영업조직팀: "A" }),
        makeRecord({ 영업조직팀: "B" }),
      ];
      const result = calcOrgAchievement(data);
      expect(result).toHaveLength(2);
    });

    it("매출 내림차순 정렬", () => {
      const data = [
        makeRecord({ 영업조직팀: "소규모", 매출액: pad(100, 80) }),
        makeRecord({ 영업조직팀: "대규모", 매출액: pad(5000, 4500) }),
      ];
      const result = calcOrgAchievement(data);
      expect(result[0].org).toBe("대규모");
    });
  });

  describe("calcTopContributors", () => {
    it("양의 갭 = 기여, 음의 갭 = 악화", () => {
      const data = [
        makeRecord({ 매출거래처: "C1", 매출액: pad(500, 700) }), // +200 gap
        makeRecord({ 매출거래처: "C2", 매출액: pad(800, 600) }), // -200 gap
      ];
      const { top, bottom } = calcTopContributors(data);
      expect(top).toHaveLength(1);
      expect(top[0].customer).toBe("C1");
      expect(bottom).toHaveLength(1);
      expect(bottom[0].customer).toBe("C2");
    });
  });

  describe("calcMarginDrift", () => {
    it("이익율 악화/개선 분리", () => {
      const data = [
        makeRecord({ 매출거래처: "악화", 매출액: pad(1000, 1000), 매출총이익: pad(300, 200) }), // 30→20% = -10pp
        makeRecord({ 매출거래처: "개선", 매출액: pad(1000, 1000), 매출총이익: pad(200, 300) }), // 20→30% = +10pp
      ];
      const result = calcMarginDrift(data);
      expect(result.worsened).toHaveLength(1);
      expect(result.improved).toHaveLength(1);
      expect(result.worsened[0].customer).toBe("악화");
      expect(result.improved[0].customer).toBe("개선");
    });

    it("계획=0인 거래처 제외 (비교 근거 없음)", () => {
      const data = [
        makeRecord({ 매출거래처: "미계획", 매출액: pad(0, 500), 매출총이익: pad(0, 100) }),
      ];
      const result = calcMarginDrift(data);
      expect(result.worsened).toHaveLength(0);
      expect(result.improved).toHaveLength(0);
      expect(result.unplannedCustomers).toHaveLength(1);
    });
  });

  describe("checkPlanDataQuality", () => {
    it("계획값 커버리지 기반 품질 레벨", () => {
      const data = [
        makeRecord({ 매출액: pad(100, 90) }),  // 계획 있음
        makeRecord({ 매출액: pad(0, 50) }),     // 계획 없음
        makeRecord({ 매출액: pad(0, 30) }),     // 계획 없음
      ];
      const quality = checkPlanDataQuality(data);
      expect(quality.salesPlanCoverage).toBeCloseTo(33.3, 0);
      expect(quality.planQualityLevel).toBe("partial");
    });

    it("모두 계획 없음 → none", () => {
      const data = [makeRecord({ 매출액: pad(0, 100) })];
      expect(checkPlanDataQuality(data).planQualityLevel).toBe("none");
    });

    it("모두 계획 있음 → good", () => {
      const data = [makeRecord({ 매출액: pad(100, 90) })];
      expect(checkPlanDataQuality(data).planQualityLevel).toBe("good");
    });
  });

  describe("generatePlanInsight", () => {
    it("계획 없음 → 적절한 메시지", () => {
      const summary = calcPlanAchievementSummary([makeRecord({ 매출액: pad(0, 100) })]);
      const orgData = calcOrgAchievement([makeRecord({ 매출액: pad(0, 100) })]);
      const quality = checkPlanDataQuality([makeRecord({ 매출액: pad(0, 100) })]);
      const insight = generatePlanInsight(summary, orgData, quality);
      expect(insight).toContain("계획 데이터가 전혀");
    });

    it("매출+이익 모두 달성 → 양호 메시지", () => {
      const data = [makeRecord({ 매출액: pad(100, 110), 매출총이익: pad(30, 35) })];
      const summary = calcPlanAchievementSummary(data);
      const orgData = calcOrgAchievement(data);
      const quality = checkPlanDataQuality(data);
      const insight = generatePlanInsight(summary, orgData, quality);
      expect(insight).toContain("양호");
    });
  });
});
