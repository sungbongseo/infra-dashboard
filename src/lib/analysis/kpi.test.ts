import { describe, it, expect } from "vitest";
import {
  calcOverviewKpis,
  calcMonthlyTrends,
  calcOrgRanking,
  calcSalesByType,
  calcCollectionRateDetail,
  calcForecastAccuracy,
  calcCollectionEfficiency,
  calcContributionMarginRate,
} from "./kpi";
import type { SalesRecord, OrderRecord, CollectionRecord, OrgProfitRecord, PlanActualDiff } from "@/types";

// ─── Test Helpers ────────────────────────────────────────────

const pad = (v: number): PlanActualDiff => ({ 계획: v, 실적: v, 차이: 0 });
const padPlan = (plan: number, actual: number): PlanActualDiff => ({
  계획: plan, 실적: actual, 차이: actual - plan,
});

function makeSale(overrides: Partial<SalesRecord> = {}): SalesRecord {
  return {
    No: 1, 공장: "", 매출번호: "", 매출일: "2024-01-15", 세무분류: "", 세무구분: "",
    거래처소분류: "", 매출처: "C001", 매출처명: "고객A", 수금처: "", 수금처명: "",
    납품처: "", 납품처명: "", 결제조건: "", 수금예정일: "", 매출상태: "", 매출유형: "",
    품목: "", 품목명: "", 규격: "", 대분류: "", 중분류: "", 소분류: "", 단위: "",
    수량: 1, 거래통화: "KRW", 환율: 1, 판매단가: 0, 판매금액: 0,
    장부단가: 0, 장부금액: 100000000, 부가세: 0, 총금액: 0, 품목범주: "",
    영업조직: "팀A", 유통경로: "", 제품군: "", 사업부: "", 영업그룹: "",
    영업담당자: "", 영업담당자명: "", 수주번호: "", 수주유형: "", 출고일: "",
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    No: 1, 수주번호: "", 순번: 1, 수주일: "2024-01-10", 납품요청일: "",
    판매처: "", 판매처명: "", 영업그룹: "", 영업담당자: "", 영업담당자명: "",
    판매지역: "", 수주유형: "", 수주유형명: "", 영업조직: "", 유통경로: "",
    거래구분: "", 품목: "", 품목명: "", 규격: "", 판매수량: 0, 판매단가: 0,
    판매금액: 0, 환율: 1, 장부단가: 0, 장부금액: 200000000, 부가세: 0,
    총금액: 0, 대분류: "", 중분류: "", 소분류: "",
    ...overrides,
  };
}

function makeCollection(overrides: Partial<CollectionRecord> = {}): CollectionRecord {
  return {
    No: 1, 수금문서번호: "", 수금유형: "", 결재방법: "", 수금계정: "",
    거래처명: "", 영업조직: "", 담당자: "", 수금일: "2024-01-20", 통화: "KRW",
    수금액: 0, 장부수금액: 80000000, 선수금액: 0, 장부선수금액: 0,
    ...overrides,
  };
}

function makeOrgProfit(overrides: Partial<OrgProfitRecord> = {}): OrgProfitRecord {
  return {
    No: 1, 판매사업본부: "", 판매사업부: "", 영업조직팀: "팀A",
    매출액: padPlan(100, 90), 실적매출원가: pad(60), 매출총이익: pad(30),
    판관변동_직접판매운반비: pad(0), 판관변동_운반비: pad(0),
    판매관리비: pad(10), 영업이익: padPlan(20, 20), 공헌이익: pad(25),
    매출원가율: pad(66.7), 매출총이익율: pad(33.3),
    판관비율: pad(11.1), 영업이익율: pad(22.2), 공헌이익율: pad(27.8),
    ...overrides,
  };
}

// ─── calcOverviewKpis ────────────────────────────────────────

describe("calcOverviewKpis", () => {
  it("calculates basic KPIs from sales/orders/collections/orgProfit", () => {
    const sales = [makeSale({ 장부금액: 1e8 })];
    const orders = [makeOrder({ 장부금액: 2e8 })];
    const collections = [makeCollection({ 장부수금액: 8e7 })];
    const orgProfit = [makeOrgProfit({
      매출액: padPlan(1e8, 1e8),
      영업이익: padPlan(0, 2e7),
    })];

    const kpis = calcOverviewKpis(sales, orders, collections, orgProfit);

    expect(kpis.totalSales).toBe(1e8);
    expect(kpis.totalOrders).toBe(2e8);
    expect(kpis.totalCollection).toBe(8e7);
    expect(kpis.collectionRate).toBe(80);
    expect(kpis.operatingProfitRate).toBe(20);
    expect(kpis.salesPlanAchievement).toBe(100);
  });

  it("handles empty arrays", () => {
    const kpis = calcOverviewKpis([], [], [], []);
    expect(kpis.totalSales).toBe(0);
    expect(kpis.collectionRate).toBe(0);
  });

  it("uses receivableAging data when provided", () => {
    const aging = [{
      No: 1, 영업조직: "", 담당자: "", 판매처: "", 판매처명: "", 통화: "KRW",
      month1: { 출고금액: 0, 장부금액: 5e7, 거래금액: 0 },
      month2: { 출고금액: 0, 장부금액: 3e7, 거래금액: 0 },
      month3: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
      month4: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
      month5: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
      month6: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
      overdue: { 출고금액: 0, 장부금액: 0, 거래금액: 0 },
      합계: { 출고금액: 0, 장부금액: 8e7, 거래금액: 0 },
      여신한도: 0,
    }];
    const kpis = calcOverviewKpis([makeSale()], [], [], [], aging);
    expect(kpis.totalReceivables).toBe(8e7);
  });
});

// ─── calcMonthlyTrends ───────────────────────────────────────

describe("calcMonthlyTrends", () => {
  it("groups sales/orders/collections by month", () => {
    const sales = [
      makeSale({ 매출일: "2024-01-15", 장부금액: 100 }),
      makeSale({ 매출일: "2024-01-20", 장부금액: 200 }),
      makeSale({ 매출일: "2024-02-10", 장부금액: 300 }),
    ];
    const orders = [makeOrder({ 수주일: "2024-01-05", 장부금액: 500 })];
    const collections = [makeCollection({ 수금일: "2024-02-15", 장부수금액: 400 })];

    const trends = calcMonthlyTrends(sales, orders, collections);

    expect(trends).toHaveLength(2);
    expect(trends[0].month).toBe("2024-01");
    expect(trends[0].매출).toBe(300);
    expect(trends[0].수주).toBe(500);
    expect(trends[1].month).toBe("2024-02");
    expect(trends[1].매출).toBe(300);
    expect(trends[1].수금).toBe(400);
  });

  it("returns sorted by month", () => {
    const sales = [
      makeSale({ 매출일: "2024-03-01", 장부금액: 1 }),
      makeSale({ 매출일: "2024-01-01", 장부금액: 2 }),
    ];
    const trends = calcMonthlyTrends(sales, [], []);
    expect(trends[0].month).toBe("2024-01");
    expect(trends[1].month).toBe("2024-03");
  });
});

// ─── calcOrgRanking ──────────────────────────────────────────

describe("calcOrgRanking", () => {
  it("aggregates and ranks by sales descending", () => {
    const sales = [
      makeSale({ 영업조직: "팀A", 장부금액: 100 }),
      makeSale({ 영업조직: "팀B", 장부금액: 400 }),
      makeSale({ 영업조직: "팀A", 장부금액: 200 }),
    ];
    const ranking = calcOrgRanking(sales);
    expect(ranking[0]).toEqual({ org: "팀B", sales: 400 });
    expect(ranking[1]).toEqual({ org: "팀A", sales: 300 });
  });
});

// ─── calcSalesByType ─────────────────────────────────────────

describe("calcSalesByType", () => {
  it("separates domestic and export sales", () => {
    const sales = [
      makeSale({ 수주유형: "내수", 거래통화: "KRW", 장부금액: 100 }),
      makeSale({ 수주유형: "수출", 거래통화: "USD", 장부금액: 200 }),
    ];
    const result = calcSalesByType(sales);
    expect(result.domestic).toBe(100);
    expect(result.exported).toBe(200);
  });
});

// ─── calcCollectionRateDetail ────────────────────────────────

describe("calcCollectionRateDetail", () => {
  it("separates prepayment from net collection", () => {
    const sales = [makeSale({ 장부금액: 1000 })];
    const collections = [makeCollection({ 장부수금액: 800, 장부선수금액: 100 })];

    const detail = calcCollectionRateDetail(sales, collections);

    expect(detail.totalCollection).toBe(800);
    expect(detail.prepaymentAmount).toBe(100);
    expect(detail.netCollection).toBe(700);
    expect(detail.totalCollectionRate).toBe(80);
    expect(detail.netCollectionRate).toBe(70);
  });

  it("handles zero sales", () => {
    const detail = calcCollectionRateDetail([], []);
    expect(detail.totalCollectionRate).toBe(0);
    expect(detail.netCollectionRate).toBe(0);
  });
});

// ─── calcForecastAccuracy ────────────────────────────────────

describe("calcForecastAccuracy", () => {
  it("returns 100 when plan equals actual", () => {
    const orgProfit = [makeOrgProfit({ 매출액: padPlan(100, 100) })];
    expect(calcForecastAccuracy(orgProfit)).toBe(100);
  });

  it("returns 80 when actual is 20% off from plan", () => {
    const orgProfit = [makeOrgProfit({ 매출액: padPlan(100, 80) })];
    expect(calcForecastAccuracy(orgProfit)).toBe(80);
  });

  it("clamps to 0 when accuracy is negative", () => {
    const orgProfit = [makeOrgProfit({ 매출액: padPlan(100, 300) })];
    expect(calcForecastAccuracy(orgProfit)).toBe(0);
  });

  it("returns 0 for empty input", () => {
    expect(calcForecastAccuracy([])).toBe(0);
  });
});

// ─── calcCollectionEfficiency ────────────────────────────────

describe("calcCollectionEfficiency", () => {
  it("calculates collections / (receivables + sales)", () => {
    expect(calcCollectionEfficiency(100, 80, 20)).toBe((80 / 120) * 100);
  });

  it("returns 0 when potential is 0", () => {
    expect(calcCollectionEfficiency(0, 0, 0)).toBe(0);
  });
});

// ─── calcContributionMarginRate ──────────────────────────────

describe("calcContributionMarginRate", () => {
  it("calculates contribution margin percentage", () => {
    const orgProfit = [
      makeOrgProfit({ 매출액: pad(100), 공헌이익: pad(40) }),
    ];
    expect(calcContributionMarginRate(orgProfit)).toBe(40);
  });

  it("returns 0 for empty array", () => {
    expect(calcContributionMarginRate([])).toBe(0);
  });
});
