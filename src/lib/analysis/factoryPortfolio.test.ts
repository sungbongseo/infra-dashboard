import { describe, it, expect } from "vitest";
import type { CustomerItemDetailRecord } from "@/types";
import { calcFactoryPortfolio, UNKNOWN_FACTORY } from "./factoryPortfolio";

function makeRec(공장: string, 계정구분: string, 매출유형: string, 매출거래처: string, 품목: string, sales: number, profit: number): CustomerItemDetailRecord {
  return {
    No: 1, 영업조직팀: "팀1", 영업담당사번: "E1",
    매출거래처, 매출거래처명: `Cust-${매출거래처}`,
    품목, 품목명: `Item-${품목}`,
    거래처대분류: "", 거래처중분류: "", 거래처소분류: "",
    제품군: "", 매출연월: "202506", 계정구분, 매출유형,
    품목군: "", 중분류코드: "", 공장,
    제품내수매출: { 계획: 0, 실적: 0, 차이: 0 },
    제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },
    매출수량: { 계획: 0, 실적: 0, 차이: 0 },
    환산수량: { 계획: 0, 실적: 0, 차이: 0 },
    매출액: { 계획: 0, 실적: sales, 차이: 0 },
    실적매출원가: { 계획: 0, 실적: sales - profit, 차이: 0 },
    상품매입: { 계획: 0, 실적: 0, 차이: 0 },
    매출총이익: { 계획: 0, 실적: profit, 차이: 0 },
    판매관리비: { 계획: 0, 실적: 0, 차이: 0 },
    판관변동_직접판매운반비: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익: { 계획: 0, 실적: profit, 차이: 0 },
    매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익율: { 계획: 0, 실적: 0, 차이: 0 },
  };
}

describe("calcFactoryPortfolio", () => {
  it("빈 데이터 → 빈 factories", () => {
    const r = calcFactoryPortfolio([]);
    expect(r.factories).toHaveLength(0);
    expect(r.unknownFactoryCount).toBe(0);
    expect(r.marginGap).toBe(0);
  });

  it("공장 빈값 → UNKNOWN_FACTORY로 분류 + counter", () => {
    const data = [
      makeRec("", "제품", "일반매출", "C1", "P1", 1000, 100),
      makeRec("", "제품", "일반매출", "C1", "P2", 500, 50),
    ];
    const r = calcFactoryPortfolio(data);
    expect(r.factories).toHaveLength(1);
    expect(r.factories[0].factory).toBe(UNKNOWN_FACTORY);
    expect(r.unknownFactoryCount).toBe(2);
  });

  it("공장 2개 매출 + 마진율 가중 계산", () => {
    const data = [
      makeRec("부산공장", "제품", "일반매출", "C1", "P1", 10000, 500),  // 5%
      makeRec("울산공장", "제품", "일반매출", "C1", "P2", 5000, 1000),   // 20%
    ];
    const r = calcFactoryPortfolio(data);
    expect(r.factories).toHaveLength(2);
    // totalSales 내림차순
    expect(r.factories[0].factory).toBe("부산공장");
    expect(r.factories[0].weightedMarginRate).toBeCloseTo(5, 1);
    expect(r.factories[1].factory).toBe("울산공장");
    expect(r.factories[1].weightedMarginRate).toBeCloseTo(20, 1);
    // 마진 격차 15%p
    expect(r.marginGap).toBeCloseTo(15, 1);
    expect(r.hasSignificantGap).toBe(true);
  });

  it("itemCount + customerCount unique 합산", () => {
    const data = [
      makeRec("부산공장", "제품", "일반매출", "C1", "P1", 1000, 100),
      makeRec("부산공장", "제품", "일반매출", "C1", "P2", 500, 50),  // 같은 customer 다른 품목
      makeRec("부산공장", "제품", "일반매출", "C2", "P1", 2000, 200), // 다른 customer 같은 품목
    ];
    const r = calcFactoryPortfolio(data);
    expect(r.factories[0].itemCount).toBe(2); // P1, P2
    expect(r.factories[0].customerCount).toBe(2); // C1, C2
  });

  it("segmentDist 계산 + dominantSegment", () => {
    const data = [
      makeRec("부산공장", "제품", "일반매출", "C1", "P1", 10000, 100), // 내수×제품
      makeRec("부산공장", "상품", "해외매출", "C2", "P2", 1000, 100),   // 해외×상품
    ];
    const r = calcFactoryPortfolio(data);
    const f = r.factories[0];
    expect(f.dominantSegment).toBe("내수×제품"); // 매출 큼
    expect(f.segmentDist["내수×제품"].sales).toBe(10000);
    expect(f.segmentDist["해외×상품"].sales).toBe(1000);
    expect(f.segmentDist["내수×제품"].salesShare).toBeCloseTo(10000 / 11000, 3);
  });

  it("0매출/음수 행 제외", () => {
    const data = [
      makeRec("부산공장", "제품", "일반매출", "C1", "P1", 1000, 100),
      makeRec("부산공장", "제품", "일반매출", "C2", "P2", 0, 0),   // 제외
      makeRec("부산공장", "제품", "일반매출", "C3", "P3", -500, 0), // 제외
    ];
    const r = calcFactoryPortfolio(data);
    expect(r.factories[0].itemCount).toBe(1); // P1만
    expect(r.factories[0].totalSales).toBe(1000);
  });

  it("반품매출/원자재 제외", () => {
    const data = [
      makeRec("부산공장", "제품", "일반매출", "C1", "P1", 1000, 100),
      makeRec("부산공장", "제품", "반품매출", "C2", "P2", 1000, 100), // 제외
      makeRec("부산공장", "원자재", "일반매출", "C3", "P3", 1000, 100), // 제외
    ];
    const r = calcFactoryPortfolio(data);
    expect(r.factories[0].itemCount).toBe(1);
  });

  it("마진 격차 계산 — UNKNOWN_FACTORY 제외", () => {
    const data = [
      makeRec("부산공장", "제품", "일반매출", "C1", "P1", 10000, 1000),  // 10%
      makeRec("울산공장", "제품", "일반매출", "C1", "P2", 10000, 500),    // 5%
      makeRec("", "제품", "일반매출", "C1", "P3", 10000, 5000),           // 50% (UNKNOWN — 격차 계산 제외)
    ];
    const r = calcFactoryPortfolio(data);
    // 부산 10% / 울산 5% / UNKNOWN은 격차 계산 제외
    expect(r.marginGap).toBeCloseTo(5, 1);
    expect(r.hasSignificantGap).toBe(false); // 5%p로 임계 10%p 미만
  });

  it("hasSignificantGap — 10%p 초과 트리거", () => {
    const data = [
      makeRec("F1", "제품", "일반매출", "C1", "P1", 10000, 100),  // 1%
      makeRec("F2", "제품", "일반매출", "C1", "P2", 10000, 1500), // 15%
    ];
    const r = calcFactoryPortfolio(data);
    expect(r.marginGap).toBeCloseTo(14, 1);
    expect(r.hasSignificantGap).toBe(true);
  });

  it("3공장 이상 — 전체 정렬 + 격차 max-min", () => {
    const data = [
      makeRec("F1", "제품", "일반매출", "C1", "P1", 1000, 50),   // 5%, 매출 1000
      makeRec("F2", "제품", "일반매출", "C2", "P2", 5000, 500),  // 10%, 매출 5000
      makeRec("F3", "제품", "일반매출", "C3", "P3", 3000, 600),  // 20%, 매출 3000
    ];
    const r = calcFactoryPortfolio(data);
    expect(r.factories.map(f => f.factory)).toEqual(["F2", "F3", "F1"]); // 매출 내림차순
    expect(r.marginGap).toBeCloseTo(15, 1); // 20% - 5%
  });
});
