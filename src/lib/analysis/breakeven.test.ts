import { describe, it, expect } from "vitest";
import {
  calcTeamBreakeven,
  calcOrgBreakeven,
  calcOrgBreakevenFromTeam,
  calcWeightedBep,
  calcBreakevenChart,
} from "./breakeven";
import type { TeamContributionRecord, OrgProfitRecord, PlanActualDiff } from "@/types";

const pad = (v: number): PlanActualDiff => ({ 계획: v, 실적: v, 차이: 0 });
const pad0 = (): PlanActualDiff => ({ 계획: 0, 실적: 0, 차이: 0 });

function makeTeamRecord(overrides: Partial<TeamContributionRecord> = {}): TeamContributionRecord {
  return {
    No: 1, 영업그룹: "", 영업조직팀: "팀A", 영업담당사번: "E001",
    매출액: pad(1000), 실적매출원가: pad(700), 매출총이익: pad(300), 매출총이익율: pad(30),
    판관변동_직접판매운반비: pad0(), 판매관리비: pad(100), 영업이익: pad(200), 영업이익율: pad(20),
    판관변동_노무비: pad(10), 판관변동_복리후생비: pad0(), 판관변동_소모품비: pad0(),
    판관변동_수도광열비: pad0(), 판관변동_수선비: pad0(), 판관변동_외주가공비: pad0(),
    판관변동_운반비: pad0(), 판관변동_지급수수료: pad0(), 판관변동_견본비: pad0(),
    판관고정_노무비: pad(30), 판관고정_감가상각비: pad(20), 판관고정_기타경비: pad(50),
    제조변동_원재료비: pad0(), 제조변동_부재료비: pad0(), 변동_상품매입: pad0(),
    제조변동_노무비: pad0(), 제조변동_복리후생비: pad0(), 제조변동_소모품비: pad0(),
    제조변동_수도광열비: pad0(), 제조변동_수선비: pad0(), 제조변동_연료비: pad0(),
    제조변동_외주가공비: pad0(), 제조변동_운반비: pad0(), 제조변동_전력비: pad0(),
    제조변동_견본비: pad0(), 제조변동_지급수수료: pad0(),
    변동비합계: pad(600), 공헌이익: pad(400), 공헌이익율: pad(40),
    ...overrides,
  };
}

function makeOrgRecord(overrides: Partial<OrgProfitRecord> = {}): OrgProfitRecord {
  return {
    No: 1, 판매사업본부: "", 판매사업부: "", 영업조직팀: "팀A",
    매출액: pad(1000), 실적매출원가: pad(700), 매출총이익: pad(300),
    판관변동_직접판매운반비: pad0(), 판매관리비: pad(100), 영업이익: pad(200),
    공헌이익: pad(400), 매출원가율: pad(70), 매출총이익율: pad(30),
    판관비율: pad(10), 영업이익율: pad(20), 공헌이익율: pad(40),
    ...overrides,
  };
}

describe("breakeven", () => {
  describe("calcTeamBreakeven", () => {
    it("정상 BEP 계산", () => {
      const data = [makeTeamRecord()];
      const result = calcTeamBreakeven(data);
      expect(result).toHaveLength(1);
      expect(result[0].canBreakEven).toBe(true);
      expect(result[0].variableCostRatio).toBeCloseTo(0.6, 2); // 600/1000
      expect(result[0].contributionMarginRatio).toBeCloseTo(0.4, 2);
      expect(result[0].bepSales).toBeCloseTo(250, 0); // 100(fixed) / 0.4
    });

    it("매출 0인 행은 건너뜀", () => {
      const data = [makeTeamRecord({ 매출액: pad(0) })];
      const result = calcTeamBreakeven(data);
      expect(result).toHaveLength(0);
    });

    it("공헌이익률 0 이하 → canBreakEven false", () => {
      const data = [makeTeamRecord({ 변동비합계: pad(1200) })]; // variable > sales
      const result = calcTeamBreakeven(data);
      expect(result[0].canBreakEven).toBe(false);
      expect(result[0].bepSales).toBe(9_999_999_999); // 센티넬 (canBreakEven=false가 권위적 플래그)
    });

    it("영업이익 0 → 레버리지 ±999 또는 0", () => {
      const data = [makeTeamRecord({ 영업이익: pad(0), 공헌이익: pad(100) })];
      const result = calcTeamBreakeven(data);
      expect(result[0].operatingLeverage).toBe(999);
    });

    it("음수 고정비 (SAP 반제 전표) 허용", () => {
      const data = [makeTeamRecord({
        판관고정_감가상각비: pad(-50),
        판관고정_기타경비: pad(-30),
        판관고정_노무비: pad(-20),
      })];
      const result = calcTeamBreakeven(data);
      expect(result[0].fixedCosts).toBe(-100);
      expect(result[0].hasNegativeFixedCosts).toBe(true);
    });
  });

  describe("calcOrgBreakeven", () => {
    it("공헌이익율 기반 BEP 계산", () => {
      const data = [makeOrgRecord()];
      const result = calcOrgBreakeven(data);
      expect(result).toHaveLength(1);
      expect(result[0].canBreakEven).toBe(true);
      // fixedCosts = 공헌이익(400) - 영업이익(200) = 200
      // BEP = 200 / 0.4 = 500
      expect(result[0].bepSales).toBeCloseTo(500, 0);
    });
  });

  describe("calcOrgBreakevenFromTeam", () => {
    it("조직별 합산 BEP — 음수 고정비 허용", () => {
      const data = [
        makeTeamRecord({ 영업조직팀: "팀A", 영업담당사번: "E001" }),
        makeTeamRecord({
          영업조직팀: "팀A", 영업담당사번: "E002",
          판관고정_감가상각비: pad(-10), 판관고정_기타경비: pad(-5), 판관고정_노무비: pad(-5),
        }),
      ];
      const result = calcOrgBreakevenFromTeam(data);
      expect(result).toHaveLength(1);
      // 두 번째 레코드의 고정비 = -20, 첫 번째 = 100 → 합산 = 80
      expect(result[0].fixedCosts).toBe(80);
      expect(result[0].hasNegativeFixedCosts).toBe(false); // 합산 후 양수이므로 false
    });

    it("소계 행(사번 빈 문자열) 제외", () => {
      const data = [
        makeTeamRecord({ 영업담당사번: "E001" }),
        makeTeamRecord({ 영업담당사번: "" }), // 소계 행
      ];
      const result = calcOrgBreakevenFromTeam(data);
      expect(result).toHaveLength(1);
    });
  });

  describe("calcWeightedBep", () => {
    it("가중평균 BEP 계산", () => {
      const orgBep = [
        { org: "A", sales: 800, variableCosts: 400, fixedCosts: 100, variableCostRatio: 0.5, contributionMarginRatio: 0.5, bepSales: 200, canBreakEven: true, safetyMarginRate: 75, operatingLeverage: 2 },
        { org: "B", sales: 200, variableCosts: 120, fixedCosts: 30, variableCostRatio: 0.6, contributionMarginRatio: 0.4, bepSales: 75, canBreakEven: true, safetyMarginRate: 62.5, operatingLeverage: 1.5 },
      ];
      const result = calcWeightedBep(orgBep);
      // weightedCMR = (800/1000)*0.5 + (200/1000)*0.4 = 0.48
      // weightedBep = (100+30) / 0.48 = 270.83
      expect(result.weightedContribMarginRatio).toBeCloseTo(0.48, 2);
      expect(result.weightedBepSales).toBeCloseTo(270.83, 0);
    });

    it("빈 데이터 → 0", () => {
      const result = calcWeightedBep([]);
      expect(result.weightedBepSales).toBe(0);
    });
  });

  describe("calcBreakevenChart", () => {
    it("20개 포인트 생성", () => {
      const points = calcBreakevenChart(100, 0.5, 1000);
      expect(points).toHaveLength(21); // 0~20 inclusive
      expect(points[0].revenue).toBe(0);
      expect(points[0].fixedCost).toBe(100);
    });

    it("maxRevenue 0 이하 → 빈 배열", () => {
      expect(calcBreakevenChart(100, 0.5, 0)).toHaveLength(0);
      expect(calcBreakevenChart(100, 0.5, -100)).toHaveLength(0);
    });
  });
});
