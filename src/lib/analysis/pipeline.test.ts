import { describe, it, expect } from "vitest";
import { calcO2CPipeline, calcMonthlyConversion } from "./pipeline";
import type { OrderRecord, SalesRecord, CollectionRecord } from "@/types";

// ─── Test Helpers ────────────────────────────────────────────

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    No: 1, 수주번호: "", 순번: 1, 수주일: "2024-01-10", 납품요청일: "",
    판매처: "", 판매처명: "", 영업그룹: "", 영업담당자: "", 영업담당자명: "",
    판매지역: "", 수주유형: "", 수주유형명: "", 영업조직: "", 유통경로: "",
    거래구분: "", 품목: "", 품목명: "", 규격: "", 판매수량: 0, 판매단가: 0,
    단가통화: "", 판매금액: 0, 환율: 1, 장부단가: 0, 장부금액: 0, 부가세: 0,
    총금액: 0, 납품처: "", 품목상태: "", 저장위치: "", 대분류: "", 중분류: "", 소분류: "",
    ...overrides,
  };
}

function makeSale(overrides: Partial<SalesRecord> = {}): SalesRecord {
  return {
    No: 1, 공장: "", 매출번호: "", 매출일: "2024-01-15", 세무분류: "", 세무구분: "",
    거래처소분류: "", 매출처: "", 매출처명: "", 수금처: "", 수금처명: "",
    납품처: "", 납품처명: "", 결제조건: "", 수금예정일: "", 부가세사업장: "",
    매출상태: "", 매출유형: "",
    품목: "", 품목명: "", 규격: "", 대분류: "", 중분류: "", 소분류: "", 단위: "",
    수량: 1, 거래통화: "KRW", 환율: 1, 판매단가: 0, 판매금액: 0,
    장부단가: 0, 장부금액: 0, 부가세: 0, 총금액: 0, 품목범주: "", 계정구분: "",
    영업조직: "", 유통경로: "", 제품군: "", 사업부: "", 영업그룹: "",
    영업담당자: "", 영업담당자명: "", 수주번호: "", 수주유형: "", 출고일: "",
    ...overrides,
  };
}

function makeCollection(overrides: Partial<CollectionRecord> = {}): CollectionRecord {
  return {
    No: 1, 수금문서번호: "", 수금유형: "", 결재방법: "", 수금계정: "",
    거래처명: "", 영업조직: "", 담당자: "", 수금일: "2024-01-20", 통화: "KRW",
    금융기관: "", 만기일: "",
    수금액: 0, 장부수금액: 0, 선수금액: 0, 장부선수금액: 0,
    ...overrides,
  };
}

// ─── calcO2CPipeline ─────────────────────────────────────────

describe("calcO2CPipeline", () => {
  it("calculates funnel stages correctly", () => {
    const orders = [makeOrder({ 장부금액: 1000 })];
    const sales = [makeSale({ 장부금액: 800 })];
    const collections = [makeCollection({ 장부수금액: 600, 장부선수금액: 100 })];

    const result = calcO2CPipeline(orders, sales, collections);

    expect(result.stages[0].stage).toBe("수주");
    expect(result.stages[0].amount).toBe(1000);

    expect(result.stages[1].stage).toBe("매출전환");
    expect(result.stages[1].amount).toBe(800);
    expect(result.stages[1].percentage).toBe(80);

    expect(result.stages[2].stage).toBe("수금완료");
    expect(result.stages[2].amount).toBe(500); // 600 - 100 prepayment

    expect(result.stages[3].stage).toBe("미수잔액");
    expect(result.stages[3].amount).toBe(300); // 800 - 500

    expect(result.prepaymentAmount).toBe(100);
    expect(result.grossCollections).toBe(600);
    expect(result.netCollections).toBe(500);
  });

  it("handles empty inputs", () => {
    const result = calcO2CPipeline([], [], []);
    expect(result.stages[0].amount).toBe(0);
    expect(result.stages[3].amount).toBe(0);
  });

  it("clamps outstanding to zero (no negative)", () => {
    const orders = [makeOrder({ 장부금액: 100 })];
    const sales = [makeSale({ 장부금액: 100 })];
    const collections = [makeCollection({ 장부수금액: 200, 장부선수금액: 0 })];

    const result = calcO2CPipeline(orders, sales, collections);
    expect(result.stages[3].amount).toBe(0); // max(0, 100-200)
  });
});

// ─── calcMonthlyConversion ───────────────────────────────────

describe("calcMonthlyConversion", () => {
  it("calculates monthly conversion and collection rates", () => {
    const orders = [makeOrder({ 수주일: "2024-01-05", 장부금액: 1000 })];
    const sales = [makeSale({ 매출일: "2024-01-15", 장부금액: 800 })];
    const collections = [makeCollection({
      수금일: "2024-01-25", 장부수금액: 700, 장부선수금액: 100,
    })];

    const result = calcMonthlyConversion(orders, sales, collections);

    expect(result).toHaveLength(1);
    expect(result[0].month).toBe("2024-01");
    expect(result[0].수주).toBe(1000);
    expect(result[0].매출).toBe(800);
    expect(result[0].수금).toBe(600); // 700 - 100 prepayment
    expect(result[0].선수금).toBe(100);
    expect(result[0].전환율).toBe(80); // 800/1000
    expect(result[0].수금율).toBe(75); // 600/800
  });

  it("returns sorted by month", () => {
    const orders = [
      makeOrder({ 수주일: "2024-03-01", 장부금액: 100 }),
      makeOrder({ 수주일: "2024-01-01", 장부금액: 200 }),
    ];

    const result = calcMonthlyConversion(orders, [], []);
    expect(result[0].month).toBe("2024-01");
    expect(result[1].month).toBe("2024-03");
  });
});
