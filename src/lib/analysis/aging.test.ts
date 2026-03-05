import { describe, it, expect } from "vitest";
import {
  calcAgingSummary,
  assessRisk,
  calcRiskAssessments,
  calcCreditUtilization,
  RISK_THRESHOLDS,
} from "./aging";
import type { ReceivableAgingRecord, AgingAmounts } from "@/types";

// ─── Test Helpers ────────────────────────────────────────────

const zeroAmounts: AgingAmounts = { 출고금액: 0, 장부금액: 0, 거래금액: 0 };
const amt = (v: number): AgingAmounts => ({ 출고금액: 0, 장부금액: v, 거래금액: 0 });

function makeAging(overrides: Partial<ReceivableAgingRecord> = {}): ReceivableAgingRecord {
  return {
    No: 1, 영업조직: "팀A", 담당자: "담당자1", 판매처: "V001", 판매처명: "거래처A", 통화: "KRW",
    month1: zeroAmounts, month2: zeroAmounts, month3: zeroAmounts,
    month4: zeroAmounts, month5: zeroAmounts, month6: zeroAmounts,
    overdue: zeroAmounts, 합계: zeroAmounts, 여신한도: 0,
    ...overrides,
  };
}

// ─── calcAgingSummary ────────────────────────────────────────

describe("calcAgingSummary", () => {
  it("sums all aging buckets across records", () => {
    const records = [
      makeAging({ month1: amt(100), month2: amt(200), 합계: amt(300) }),
      makeAging({ month1: amt(50), month3: amt(150), 합계: amt(200) }),
    ];

    const summary = calcAgingSummary(records);

    expect(summary.month1).toBe(150);
    expect(summary.month2).toBe(200);
    expect(summary.month3).toBe(150);
    expect(summary.total).toBe(500);
  });

  it("returns zeros for empty array", () => {
    const summary = calcAgingSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.month1).toBe(0);
  });
});

// ─── assessRisk ──────────────────────────────────────────────

describe("assessRisk", () => {
  it("returns 'low' for zero total", () => {
    expect(assessRisk(makeAging())).toBe("low");
  });

  it("returns 'low' for mostly current receivables", () => {
    const record = makeAging({
      month1: amt(900), month2: amt(100),
      합계: amt(1000),
    });
    expect(assessRisk(record)).toBe("low");
  });

  it("returns 'medium' when overdue ratio > 20%", () => {
    // month3+ = 300 out of 1000 = 30% > 20%
    const record = makeAging({
      month1: amt(500), month2: amt(200), month3: amt(300),
      합계: amt(1000),
    });
    expect(assessRisk(record)).toBe("medium");
  });

  it("returns 'high' when overdue ratio > 50%", () => {
    // month3+ = 600 out of 1000 = 60% > 50%
    const record = makeAging({
      month1: amt(200), month2: amt(200), month3: amt(600),
      합계: amt(1000),
    });
    expect(assessRisk(record)).toBe("high");
  });

  it("returns 'high' when long-term amount exceeds 1억", () => {
    // month6 + overdue > 1억
    const record = makeAging({
      month1: amt(5e8), month6: amt(5e7), overdue: amt(6e7),
      합계: amt(6.1e8),
    });
    expect(assessRisk(record)).toBe("high");
  });

  it("returns 'medium' when overdue amount > 5천만 (even if ratio is low)", () => {
    // month3 = 6e7 out of 1e9 = 6% ratio, but amount > 5천만
    const record = makeAging({
      month1: amt(9.4e8), month3: amt(6e7),
      합계: amt(1e9),
    });
    expect(assessRisk(record)).toBe("medium");
  });
});

// ─── calcRiskAssessments ─────────────────────────────────────

describe("calcRiskAssessments", () => {
  it("calculates risk assessments and filters out zero-total records", () => {
    const records = [
      makeAging({ 판매처: "V001", month1: amt(500), month3: amt(500), 합계: amt(1000) }),
      makeAging({ 판매처: "V002", 합계: amt(0) }),
    ];

    const assessments = calcRiskAssessments(records);

    expect(assessments).toHaveLength(1);
    expect(assessments[0].판매처).toBe("V001");
    expect(assessments[0].연체비율).toBe(50);
    // 50% overdue ratio = exactly at HIGH_OVERDUE_RATIO threshold (not exceeded)
    expect(assessments[0].riskGrade).toBe("medium");
  });

  it("sorts by total receivable descending", () => {
    const records = [
      makeAging({ 판매처: "V001", month1: amt(100), 합계: amt(100) }),
      makeAging({ 판매처: "V002", month1: amt(500), 합계: amt(500) }),
    ];

    const assessments = calcRiskAssessments(records);
    expect(assessments[0].판매처).toBe("V002");
  });
});

// ─── calcCreditUtilization ───────────────────────────────────

describe("calcCreditUtilization", () => {
  it("calculates credit utilization rate", () => {
    const records = [
      makeAging({ 판매처: "V001", 합계: amt(8e7), 여신한도: 1e8 }),
    ];

    const result = calcCreditUtilization(records);
    expect(result).toHaveLength(1);
    expect(result[0].사용률).toBe(80);
    expect(result[0].상태).toBe("warning");
  });

  it("marks danger when utilization >= 100%", () => {
    const records = [
      makeAging({ 판매처: "V001", 합계: amt(1.2e8), 여신한도: 1e8 }),
    ];

    const result = calcCreditUtilization(records);
    expect(result[0].상태).toBe("danger");
  });

  it("skips records with zero credit limit", () => {
    const records = [makeAging({ 판매처: "V001", 합계: amt(1e7), 여신한도: 0 })];
    expect(calcCreditUtilization(records)).toHaveLength(0);
  });

  it("groups multiple records by 판매처", () => {
    const records = [
      makeAging({ 판매처: "V001", 합계: amt(5e7), 여신한도: 1e8 }),
      makeAging({ 판매처: "V001", 합계: amt(3e7), 여신한도: 1e8 }),
    ];

    const result = calcCreditUtilization(records);
    expect(result).toHaveLength(1);
    expect(result[0].총미수금).toBe(8e7);
  });
});
