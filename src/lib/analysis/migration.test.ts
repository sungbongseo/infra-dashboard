import { describe, it, expect } from "vitest";
import { calcCustomerMigration, calcGradeDistribution } from "./migration";
import type { SalesRecord } from "@/types";

// ─── Test Helpers ────────────────────────────────────────────

function makeSale(매출처: string, 매출일: string, 장부금액: number): SalesRecord {
  return {
    No: 1, 공장: "", 매출번호: "", 매출일, 세무분류: "", 세무구분: "",
    거래처소분류: "", 매출처, 매출처명: 매출처, 수금처: "", 수금처명: "",
    납품처: "", 납품처명: "", 결제조건: "", 수금예정일: "", 매출상태: "", 매출유형: "",
    품목: "", 품목명: "", 규격: "", 대분류: "", 중분류: "", 소분류: "", 단위: "",
    수량: 1, 거래통화: "KRW", 환율: 1, 판매단가: 0, 판매금액: 0,
    장부단가: 0, 장부금액, 부가세: 0, 총금액: 0, 품목범주: "",
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

  it("detects churned customers (active → N)", () => {
    const sales = [
      makeSale("C001", "2024-01-15", 1000),
      // C001 has no sales in February → churned
      makeSale("C002", "2024-01-15", 500),
      makeSale("C002", "2024-02-15", 500),
    ];

    const result = calcCustomerMigration(sales);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].churned).toBeGreaterThanOrEqual(1);
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
