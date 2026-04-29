import { describe, it, expect } from "vitest";
import { calcCustomerMigration, calcGradeDistribution } from "./migration";
import type { SalesRecord } from "@/types";

// ─── Test Helpers ────────────────────────────────────────────

function makeSale(매출처: string, 매출일: string, 장부금액: number): SalesRecord {
  return {
    No: 1, 공장: "", 매출번호: "", 매출일, 세무분류: "", 세무구분: "",
    거래처소분류: "", 매출처, 매출처명: 매출처, 수금처: "", 수금처명: "",
    납품처: "", 납품처명: "", 결제조건: "", 수금예정일: "", 부가세사업장: "",
    매출상태: "", 매출유형: "",
    품목: "", 품목명: "", 규격: "", 대분류: "", 중분류: "", 소분류: "", 단위: "",
    수량: 1, 거래통화: "KRW", 환율: 1, 판매단가: 0, 판매금액: 0,
    장부단가: 0, 장부금액, 부가세: 0, 총금액: 0, 품목범주: "", 계정구분: "",
    영업조직: "", 유통경로: "", 제품군: "", 사업부: "", 영업그룹: "",
    영업담당자: "", 영업담당자명: "", 수주번호: "", 수주유형: "", 출고일: "",
  };
}

// ─── calcCustomerMigration ───────────────────────────────────

describe("calcCustomerMigration", () => {
  it("returns empty result for empty input", () => {
    const result = calcCustomerMigration([]);
    expect(result.matrices).toHaveLength(0);
    expect(result.summaries).toHaveLength(0);
  });

  it("detects churned customers (active → N after 3+ consecutive empty months)", () => {
    // B2B 보정 (migration.ts:198-219): 연속 3개월 미만 공백은 이전 등급 유지
    // → 진짜 churn 감지하려면 3개월 연속 공백 필요
    const sales = [
      makeSale("C001", "2024-01-15", 1000),
      // C001: 2/3/4월 모두 공백 → 4월에 consecutiveZero=3 도달 → N으로 전환
      makeSale("C002", "2024-01-15", 500),
      makeSale("C002", "2024-02-15", 500),
      makeSale("C002", "2024-03-15", 500),
      makeSale("C002", "2024-04-15", 500),
    ];

    const result = calcCustomerMigration(sales);
    expect(result.summaries.length).toBeGreaterThanOrEqual(3); // 1→2, 2→3, 3→4
    // 마지막 transition (3→4)에서 C001이 churn으로 잡힘
    const lastSummary = result.summaries[result.summaries.length - 1];
    expect(lastSummary.churned).toBeGreaterThanOrEqual(1);
  });

  it("B2B 보정: 1개월 공백은 이전 등급 유지 (not churn)", () => {
    const sales = [
      makeSale("C001", "2024-01-15", 1000),
      // C001: 2월 공백 (1개월만)
      makeSale("C001", "2024-03-15", 1000),
      makeSale("C002", "2024-01-15", 500),
      makeSale("C002", "2024-02-15", 500),
      makeSale("C002", "2024-03-15", 500),
    ];

    const result = calcCustomerMigration(sales);
    // 1→2 transition: C001은 1개월 공백이므로 등급 유지 → churn=0
    const firstTransition = result.summaries[0];
    expect(firstTransition.churned).toBe(0);
  });

  it("B2B 보정: 2개월 공백도 이전 등급 유지 (not churn)", () => {
    const sales = [
      makeSale("C001", "2024-01-15", 1000),
      // C001: 2/3월 연속 공백 (2개월) — 4월 재개 시점에서 보면 churn 아님
      makeSale("C001", "2024-04-15", 1000),
      makeSale("C002", "2024-01-15", 500),
      makeSale("C002", "2024-02-15", 500),
      makeSale("C002", "2024-03-15", 500),
      makeSale("C002", "2024-04-15", 500),
    ];

    const result = calcCustomerMigration(sales);
    // 모든 transition에서 C001 churn 미감지 (consecutiveZero<3 유지)
    for (const summary of result.summaries) {
      expect(summary.churned).toBe(0);
    }
  });

  it("B2B 보정: 3개월 연속 공백 시 N으로 전환 (churn 감지)", () => {
    const sales = [
      makeSale("C001", "2024-01-15", 1000),
      // C001: 2/3/4월 연속 공백 (3개월) → 4월에 N 전환
      makeSale("C002", "2024-01-15", 500),
      makeSale("C002", "2024-02-15", 500),
      makeSale("C002", "2024-03-15", 500),
      makeSale("C002", "2024-04-15", 500),
    ];

    const result = calcCustomerMigration(sales);
    // 3→4 transition에서 C001이 처음으로 N으로 전환 → churn 감지
    const lastSummary = result.summaries[result.summaries.length - 1];
    expect(lastSummary.churned).toBeGreaterThanOrEqual(1);
  });

  it("detects new customers (N → active)", () => {
    const sales = [
      makeSale("C001", "2024-01-15", 1000),
      makeSale("C001", "2024-02-15", 1000),
      makeSale("C002", "2024-02-15", 500), // new in Feb
    ];

    const result = calcCustomerMigration(sales);
    expect(result.summaries[0].newCustomers).toBeGreaterThanOrEqual(1);
  });

  it("assigns negative sales to grade D (not higher)", () => {
    // Customer with negative sales (returns) should be capped at D
    const sales = [
      makeSale("C001", "2024-01-15", -500),
      makeSale("C002", "2024-01-15", 10000),
      makeSale("C001", "2024-02-15", -500),
      makeSale("C002", "2024-02-15", 10000),
    ];

    const result = calcCustomerMigration(sales);
    // C001 should stay at D in both months (maintained)
    const summary = result.summaries[0];
    expect(summary.maintained).toBeGreaterThanOrEqual(1);
  });

  it("calculates grade thresholds from positive amounts only", () => {
    const sales = [
      makeSale("C001", "2024-01-15", 1000),
      makeSale("C002", "2024-01-15", -500), // negative excluded from thresholds
    ];

    const result = calcCustomerMigration(sales);
    expect(result.gradeThresholds.A).toBeGreaterThan(0);
    expect(result.gradeThresholds.B).toBeGreaterThan(0);
    expect(result.gradeThresholds.C).toBeGreaterThan(0);
  });
});

// ─── calcGradeDistribution ───────────────────────────────────

describe("calcGradeDistribution", () => {
  it("returns empty for empty input", () => {
    expect(calcGradeDistribution([])).toHaveLength(0);
  });

  it("counts customers per grade per month", () => {
    const sales = [
      makeSale("C001", "2024-01-15", 10000),
      makeSale("C002", "2024-01-15", 5000),
      makeSale("C003", "2024-01-15", 1000),
      makeSale("C004", "2024-01-15", 100),
    ];

    const dist = calcGradeDistribution(sales);
    expect(dist).toHaveLength(1);
    const entry = dist[0];
    expect(entry.month).toBe("2024-01");
    // All 4 customers should be distributed across A/B/C/D
    expect(entry.A + entry.B + entry.C + entry.D).toBe(4);
  });

  it("excludes zero-amount customers from distribution", () => {
    const sales = [
      makeSale("C001", "2024-01-15", 1000),
      // C002 has 0 amount → grade N → not counted
    ];

    const dist = calcGradeDistribution(sales);
    expect(dist[0].A + dist[0].B + dist[0].C + dist[0].D).toBe(1);
  });
});
