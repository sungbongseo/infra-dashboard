import { describe, it, expect } from "vitest";
import type { CustomerItemDetailRecord } from "@/types";
import {
  calcMonthlyVolatility,
  classifyVolatilityLevel,
  classifyVolatilityQuadrant,
  getVolatilityQuadrantLabel,
} from "./monthlyVolatility";

function makeRec(
  품목: string, 품목명: string,
  계정구분: string, 매출유형: string,
  매출액: number, 매출연월: string,
): CustomerItemDetailRecord {
  return {
    No: 1, 영업조직팀: "팀1", 영업담당사번: "E1",
    매출거래처: "C1", 매출거래처명: "고객A",
    품목, 품목명, 거래처대분류: "", 거래처중분류: "", 거래처소분류: "",
    제품군: "", 매출연월, 계정구분, 매출유형,
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

describe("classifyVolatilityLevel", () => {
  it("거래월 < 3 → insufficient_data", () => {
    expect(classifyVolatilityLevel(0.1, 2)).toBe("insufficient_data");
    expect(classifyVolatilityLevel(0.5, 1)).toBe("insufficient_data");
  });
  it("CV < 0.3 → stable", () => {
    expect(classifyVolatilityLevel(0, 12)).toBe("stable");
    expect(classifyVolatilityLevel(0.29, 6)).toBe("stable");
  });
  it("0.3 ≤ CV ≤ 0.5 → moderate", () => {
    expect(classifyVolatilityLevel(0.3, 6)).toBe("moderate");
    expect(classifyVolatilityLevel(0.5, 6)).toBe("moderate");
  });
  it("CV > 0.5 → volatile", () => {
    expect(classifyVolatilityLevel(0.51, 6)).toBe("volatile");
    expect(classifyVolatilityLevel(2.0, 6)).toBe("volatile");
  });
});

describe("classifyVolatilityQuadrant", () => {
  it("monthCount<3 → insufficient_data", () => {
    expect(classifyVolatilityQuadrant(1000, 0.5, 500, 0.3, 2)).toBe("insufficient_data");
  });
  it("big + stable → stable_cash_cow", () => {
    expect(classifyVolatilityQuadrant(1000, 0.1, 500, 0.3, 6)).toBe("stable_cash_cow");
  });
  it("big + volatile → volatile_big (위험)", () => {
    expect(classifyVolatilityQuadrant(1000, 0.8, 500, 0.3, 6)).toBe("volatile_big");
  });
  it("small + stable → stable_small", () => {
    expect(classifyVolatilityQuadrant(100, 0.1, 500, 0.3, 6)).toBe("stable_small");
  });
  it("small + volatile → one_shot", () => {
    expect(classifyVolatilityQuadrant(100, 0.8, 500, 0.3, 6)).toBe("one_shot");
  });
});

describe("calcMonthlyVolatility", () => {
  it("빈 데이터 → 빈 entries", () => {
    const r = calcMonthlyVolatility([]);
    expect(r.entries).toHaveLength(0);
    expect(r.insufficientDataItems).toBe(0);
  });

  it("균등 매출 6개월 → CV ≈ 0 (stable)", () => {
    const data: CustomerItemDetailRecord[] = [];
    for (const m of ["202501", "202502", "202503", "202504", "202505", "202506"]) {
      data.push(makeRec("P001", "균등품목", "제품", "일반매출", 1000, m));
    }
    const r = calcMonthlyVolatility(data);
    expect(r.entries).toHaveLength(1);
    const e = r.entries[0];
    expect(e.monthCount).toBe(6);
    expect(e.meanSales).toBe(1000);
    expect(e.cv).toBeCloseTo(0, 5);
    expect(e.level).toBe("stable");
  });

  it("매출 변동 큰 6개월 → CV > 0.5 (volatile)", () => {
    const data: CustomerItemDetailRecord[] = [];
    // 평균 1000, 일부 0/2000 → stdev 큼
    const sales = [2000, 0, 2000, 0, 2000, 0];
    sales.forEach((s, i) => {
      data.push(makeRec("P002", "변동품목", "제품", "일반매출", s, `20250${i + 1}`));
    });
    const r = calcMonthlyVolatility(data);
    // 0매출 행은 사전 필터되므로 monthCount=3 (2000인 월만)
    expect(r.entries[0].monthCount).toBe(3);
    expect(r.entries[0].meanSales).toBe(2000);
    expect(r.entries[0].cv).toBeCloseTo(0, 1); // 모두 2000이므로 stable
  });

  it("매출 점진 증가 12M → CV 중간 수준 (moderate)", () => {
    const data: CustomerItemDetailRecord[] = [];
    // 매출 100, 200, 300, ..., 1200 (12개월)
    for (let i = 1; i <= 12; i++) {
      data.push(makeRec("P003", "성장품목", "제품", "일반매출", i * 100, `2025${i.toString().padStart(2, "0")}`));
    }
    const r = calcMonthlyVolatility(data);
    const e = r.entries[0];
    expect(e.monthCount).toBe(12);
    expect(e.meanSales).toBe(650); // (100+1200)/2
    // stdev = sqrt(Σ(x-650)² / 12) ≈ 346.4 → CV ≈ 0.53 → volatile
    expect(e.cv).toBeGreaterThan(0.5);
    expect(e.level).toBe("volatile");
  });

  it("거래월 < 3 → insufficient_data 별도 카운트", () => {
    const data = [
      makeRec("P001", "단발", "제품", "일반매출", 1000, "202506"),
      makeRec("P002", "이건단발2", "제품", "일반매출", 500, "202506"),
    ];
    const r = calcMonthlyVolatility(data);
    expect(r.entries).toHaveLength(2);
    expect(r.entries.every(e => e.level === "insufficient_data")).toBe(true);
    expect(r.insufficientDataItems).toBe(2);
  });

  it("4 quadrant 분류 + highRiskItems (volatile_big)", () => {
    const data: CustomerItemDetailRecord[] = [];
    // P001: 큰 매출 + 안정 (stable_cash_cow)
    for (let i = 1; i <= 6; i++) data.push(makeRec("P001", "효자", "제품", "일반매출", 10000, `20250${i}`));
    // P002: 큰 매출 + 변동 (volatile_big — 위험)
    [100, 50000, 100, 50000, 100, 50000].forEach((s, i) =>
      data.push(makeRec("P002", "위험", "제품", "일반매출", s, `20250${i + 1}`))
    );
    // P003: 작은 매출 + 안정 (stable_small)
    for (let i = 1; i <= 6; i++) data.push(makeRec("P003", "정기", "제품", "일반매출", 100, `20250${i}`));

    const r = calcMonthlyVolatility(data);
    expect(r.entries.length).toBe(3);
    // P002는 변동 큼 (CV > median)
    const p2 = r.entries.find(e => e.itemCode === "P002")!;
    expect(p2.cv).toBeGreaterThan(0.5);
    // highRiskItems에는 volatile_big 만
    expect(r.highRiskItems.every(e => e.quadrant === "volatile_big")).toBe(true);
  });

  it("0매출 행 사전 필터 → CV 계산에 영향 없음", () => {
    const data = [
      makeRec("P001", "P", "제품", "일반매출", 1000, "202501"),
      makeRec("P001", "P", "제품", "일반매출", 0, "202502"),    // 제외
      makeRec("P001", "P", "제품", "일반매출", 1000, "202503"),
      makeRec("P001", "P", "제품", "일반매출", 1000, "202504"),
    ];
    const r = calcMonthlyVolatility(data);
    expect(r.entries).toHaveLength(1);
    // 0 매출 제외 → 3개월만 1000 → stable
    expect(r.entries[0].monthCount).toBe(3);
    expect(r.entries[0].meanSales).toBe(1000);
    expect(r.entries[0].cv).toBeCloseTo(0, 5);
  });

  it("4 segment 분리 — 같은 itemCode 다른 segment 별도 entry", () => {
    const data = [
      makeRec("P001", "내수제품", "제품", "일반매출", 1000, "202501"),
      makeRec("P001", "내수제품", "제품", "일반매출", 1000, "202502"),
      makeRec("P001", "내수제품", "제품", "일반매출", 1000, "202503"),
      makeRec("P001", "해외제품", "제품", "해외매출", 2000, "202501"),
      makeRec("P001", "해외제품", "제품", "해외매출", 2000, "202502"),
      makeRec("P001", "해외제품", "제품", "해외매출", 2000, "202503"),
    ];
    const r = calcMonthlyVolatility(data);
    expect(r.entries).toHaveLength(2);
    const seg = r.entries.map(e => e.segment).sort();
    expect(seg).toEqual(["내수×제품", "해외×제품"]);
  });

  it("VolatilityQuadrantLabel 한국어 포함", () => {
    expect(getVolatilityQuadrantLabel("stable_cash_cow")).toContain("효자");
    expect(getVolatilityQuadrantLabel("volatile_big")).toContain("위험");
    expect(getVolatilityQuadrantLabel("stable_small")).toContain("정기");
    expect(getVolatilityQuadrantLabel("one_shot")).toContain("일회성");
  });
});
