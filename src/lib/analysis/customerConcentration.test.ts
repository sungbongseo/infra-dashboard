import { describe, it, expect } from "vitest";
import type { CustomerItemDetailRecord } from "@/types";
import {
  calcCustomerConcentration,
  classifyHHILevel,
  getHHILevelLabel,
} from "./customerConcentration";

function makeRec(
  계정구분: string,
  매출유형: string,
  매출거래처: string,
  매출거래처명: string,
  매출액: number,
): CustomerItemDetailRecord {
  return {
    No: 1, 영업조직팀: "팀1", 영업담당사번: "E1",
    매출거래처, 매출거래처명,
    품목: "P", 품목명: "품목",
    거래처대분류: "", 거래처중분류: "", 거래처소분류: "",
    제품군: "", 매출연월: "202506", 계정구분, 매출유형,
    품목군: "", 중분류코드: "", 공장: "",
    제품내수매출: { 계획: 0, 실적: 0, 차이: 0 },
    제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },
    매출수량: { 계획: 0, 실적: 100, 차이: 0 },
    환산수량: { 계획: 0, 실적: 100, 차이: 0 },
    매출액: { 계획: 0, 실적: 매출액, 차이: 0 },
    실적매출원가: { 계획: 0, 실적: 매출액 * 0.9, 차이: 0 },
    상품매입: { 계획: 0, 실적: 0, 차이: 0 },
    매출총이익: { 계획: 0, 실적: 매출액 * 0.1, 차이: 0 },
    판매관리비: { 계획: 0, 실적: 0, 차이: 0 },
    판관변동_직접판매운반비: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익: { 계획: 0, 실적: 매출액 * 0.05, 차이: 0 },
    매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익율: { 계획: 0, 실적: 0, 차이: 0 },
  };
}

describe("classifyHHILevel — US DOJ 기준", () => {
  it("HHI < 1500 → dispersed", () => {
    expect(classifyHHILevel(0)).toBe("dispersed");
    expect(classifyHHILevel(1499)).toBe("dispersed");
  });
  it("1500 ≤ HHI ≤ 2500 → moderate", () => {
    expect(classifyHHILevel(1500)).toBe("moderate");
    expect(classifyHHILevel(2500)).toBe("moderate");
  });
  it("HHI > 2500 → concentrated", () => {
    expect(classifyHHILevel(2501)).toBe("concentrated");
    expect(classifyHHILevel(10000)).toBe("concentrated");
  });
});

describe("calcCustomerConcentration", () => {
  it("빈 데이터 → 모든 segment HHI=0, level=dispersed", () => {
    const r = calcCustomerConcentration([]);
    for (const seg of ["내수×제품", "내수×상품", "해외×제품", "해외×상품"] as const) {
      expect(r.segments[seg].hhi).toBe(0);
      expect(r.segments[seg].totalCustomers).toBe(0);
    }
    expect(r.highRiskSegments).toBe(0);
  });

  it("단일 거래처 100% → HHI=10000 (독점)", () => {
    const data = [makeRec("제품", "일반매출", "C001", "고객A", 1000)];
    const r = calcCustomerConcentration(data);
    const m = r.segments["내수×제품"];
    expect(m.hhi).toBe(10000);
    expect(m.level).toBe("concentrated");
    expect(m.top5Share).toBe(1);
    expect(m.totalCustomers).toBe(1);
  });

  it("균등 분산 — 100 거래처 1% 매출 → HHI=100 (분산)", () => {
    const data: CustomerItemDetailRecord[] = [];
    for (let i = 0; i < 100; i++) {
      data.push(makeRec("제품", "일반매출", `C${i.toString().padStart(3, "0")}`, `Cust${i}`, 1000));
    }
    const r = calcCustomerConcentration(data);
    const m = r.segments["내수×제품"];
    // 100 거래처 각 1% → HHI = 100 × 0.01^2 × 10000 = 100
    expect(m.hhi).toBeCloseTo(100, 1);
    expect(m.level).toBe("dispersed");
    expect(m.totalCustomers).toBe(100);
    expect(m.topCustomers).toHaveLength(10);
  });

  it("Top 5 매출 비중 계산 + 누적 정확", () => {
    const data = [
      makeRec("제품", "일반매출", "C1", "Top1", 5000),
      makeRec("제품", "일반매출", "C2", "Top2", 3000),
      makeRec("제품", "일반매출", "C3", "Top3", 1000),
      makeRec("제품", "일반매출", "C4", "Top4", 500),
      makeRec("제품", "일반매출", "C5", "Top5", 500),
    ];
    const r = calcCustomerConcentration(data);
    const m = r.segments["내수×제품"];
    expect(m.totalSales).toBe(10000);
    expect(m.top5Share).toBeCloseTo(1.0, 5);
    expect(m.topCustomers[0].rank).toBe(1);
    expect(m.topCustomers[0].salesShare).toBeCloseTo(0.5, 2);
    expect(m.topCustomers[0].cumulativeShare).toBeCloseTo(0.5, 2);
    expect(m.topCustomers[1].cumulativeShare).toBeCloseTo(0.8, 2);
  });

  it("0매출/음수 거래처 제외 + counter 노출", () => {
    const data = [
      makeRec("제품", "일반매출", "C1", "정상", 1000),
      makeRec("제품", "일반매출", "C2", "0매출", 0),
      makeRec("제품", "일반매출", "C3", "음수", -500),
    ];
    const r = calcCustomerConcentration(data);
    const m = r.segments["내수×제품"];
    expect(m.totalCustomers).toBe(1); // C1만
    expect(m.excludedCustomers).toBe(2); // C2, C3
  });

  it("4 segment 분리 — 각 segment별 HHI 독립 계산", () => {
    const data = [
      // 내수×제품: 1 거래처 → HHI=10000
      makeRec("제품", "일반매출", "C1", "내수제품", 1000),
      // 해외×상품: 2 균등 거래처 → HHI=5000
      makeRec("상품", "해외매출", "C2", "해외상품A", 500),
      makeRec("상품", "해외매출", "C3", "해외상품B", 500),
    ];
    const r = calcCustomerConcentration(data);
    expect(r.segments["내수×제품"].hhi).toBe(10000);
    expect(r.segments["해외×상품"].hhi).toBe(5000); // 0.5^2 + 0.5^2 = 0.5 → ×10000
    expect(r.segments["내수×상품"].totalCustomers).toBe(0);
    expect(r.segments["해외×제품"].totalCustomers).toBe(0);
  });

  it("highRiskSegments 카운트 (HHI > 2500 segment 수)", () => {
    const data = [
      makeRec("제품", "일반매출", "C1", "독점1", 10000),  // 내수×제품 HHI=10000
      makeRec("상품", "일반매출", "C2", "독점2", 10000),  // 내수×상품 HHI=10000
      // 해외 segment는 0
    ];
    const r = calcCustomerConcentration(data);
    expect(r.highRiskSegments).toBe(2);
    expect(r.avgHHI).toBe(10000); // 두 active segment 평균
  });

  it("HHI 한국어 라벨 포함", () => {
    expect(getHHILevelLabel("dispersed")).toContain("분산");
    expect(getHHILevelLabel("moderate")).toContain("적정");
    expect(getHHILevelLabel("concentrated")).toContain("집중");
  });
});
