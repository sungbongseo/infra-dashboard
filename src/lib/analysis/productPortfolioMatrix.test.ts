import { describe, it, expect } from "vitest";
import type { CustomerItemDetailRecord } from "@/types";
import {
  calcPortfolioMatrix,
  classifySegmentType,
  classifyQuadrant,
  getQuadrantKoreanName,
  getQuadrantAction,
} from "./productPortfolioMatrix";

// ─── 헬퍼 ────────────────────────────────────────────

function makeRec(
  계정구분: string,
  매출유형: string,
  품목: string,
  품목명: string,
  매출액: number,
  영업이익: number,
  매출연월 = "202506",
): CustomerItemDetailRecord {
  return {
    No: 1,
    영업조직팀: "건자재팀",
    영업담당사번: "E001",
    매출거래처: "C001",
    매출거래처명: "테스트거래처",
    품목, 품목명,
    거래처대분류: "", 거래처중분류: "", 거래처소분류: "",
    제품군: "방수",
    매출연월,
    계정구분, 매출유형,
    품목군: "", 중분류코드: "",
    공장: "",
    제품내수매출: { 계획: 0, 실적: 0, 차이: 0 },
    제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },
    매출수량: { 계획: 0, 실적: 100, 차이: 0 },
    환산수량: { 계획: 0, 실적: 100, 차이: 0 },
    매출액: { 계획: 0, 실적: 매출액, 차이: 0 },
    실적매출원가: { 계획: 0, 실적: 매출액 - 영업이익, 차이: 0 },
    상품매입: { 계획: 0, 실적: 0, 차이: 0 },
    매출총이익: { 계획: 0, 실적: 영업이익, 차이: 0 },
    판매관리비: { 계획: 0, 실적: 0, 차이: 0 },
    판관변동_직접판매운반비: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익: { 계획: 0, 실적: 영업이익, 차이: 0 },
    매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익율: { 계획: 0, 실적: 0, 차이: 0 },
  };
}

// ─── classifySegmentType ─────────────────────────────

describe("classifySegmentType", () => {
  it("일반매출 → 내수", () => {
    expect(classifySegmentType("일반매출")).toBe("내수");
  });

  it("일반매출(주유소) → 내수", () => {
    expect(classifySegmentType("일반매출(주유소)")).toBe("내수");
  });

  it("일반매출(품목라인X) → 내수", () => {
    expect(classifySegmentType("일반매출(품목라인X)")).toBe("내수");
  });

  it("자동매출 → 내수", () => {
    expect(classifySegmentType("자동매출")).toBe("내수");
  });

  it("해외매출 → 해외", () => {
    expect(classifySegmentType("해외매출")).toBe("해외");
  });

  it("반품매출 → 제외", () => {
    expect(classifySegmentType("반품매출")).toBe("제외");
  });

  it("빈값 → 내수 (default)", () => {
    expect(classifySegmentType("")).toBe("내수");
    expect(classifySegmentType("   ")).toBe("내수");
  });
});

// ─── classifyQuadrant ────────────────────────────────

describe("classifyQuadrant", () => {
  it("Star: 대매출 + 고마진", () => {
    expect(classifyQuadrant(1000, 10, 500, 5)).toBe("star");
  });

  it("Cash Cow: 대매출 + 저마진", () => {
    expect(classifyQuadrant(1000, 2, 500, 5)).toBe("cash_cow");
  });

  it("Question Mark: 소매출 + 고마진", () => {
    expect(classifyQuadrant(100, 10, 500, 5)).toBe("problem_child");
  });

  it("Dog: 소매출 + 저마진", () => {
    expect(classifyQuadrant(100, 2, 500, 5)).toBe("dog");
  });

  it("정확히 임계값 → Star (>=)", () => {
    expect(classifyQuadrant(500, 5, 500, 5)).toBe("star");
  });
});

// ─── calcPortfolioMatrix ─────────────────────────────

describe("calcPortfolioMatrix — 빈 데이터 / edge case", () => {
  it("빈 배열 → 빈 결과", () => {
    const result = calcPortfolioMatrix([]);
    expect(result.matrices["내수×제품"].entries).toHaveLength(0);
    expect(result.overallSummary.totalSales).toBe(0);
  });

  it("0 매출 행 사전 필터링 (보완 4)", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "품목A", 1000, 100),
      makeRec("제품", "일반매출", "P002", "품목B", 0, 0), // 0 매출 → 제외
    ];
    const result = calcPortfolioMatrix(data);
    expect(result.matrices["내수×제품"].entries).toHaveLength(1);
    expect(result.overallSummary.excludedZeroSales).toBe(1);
  });

  it("반품매출 제외 (보완 5)", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "품목A", 1000, 100),
      makeRec("제품", "반품매출", "P002", "품목B", -500, -50), // 음수도 sales<=0 필터에 잡힘
      makeRec("상품", "반품매출", "P003", "품목C", 1000, 100), // 양수지만 반품 → segment 제외
    ];
    const result = calcPortfolioMatrix(data);
    expect(result.overallSummary.excludedReturns).toBeGreaterThanOrEqual(1);
  });

  it("계정구분 ∉ {제품, 상품} 필터링", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "품목A", 1000, 100),
      makeRec("원자재", "일반매출", "P002", "품목B", 1000, 100), // 제외
      makeRec("부재료", "일반매출", "P003", "품목C", 1000, 100), // 제외
    ];
    const result = calcPortfolioMatrix(data);
    expect(result.matrices["내수×제품"].entries).toHaveLength(1);
  });
});

describe("calcPortfolioMatrix — 4-way Segment 분류", () => {
  it("4 segment 모두 분류 + 별도 집계", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "내수제품", 1000, 100),
      makeRec("상품", "일반매출", "P002", "내수상품", 2000, 50),
      makeRec("제품", "해외매출", "P003", "해외제품", 1500, 200),
      makeRec("상품", "해외매출", "P004", "해외상품", 500, 10),
    ];
    const result = calcPortfolioMatrix(data);
    expect(result.matrices["내수×제품"].entries).toHaveLength(1);
    expect(result.matrices["내수×상품"].entries).toHaveLength(1);
    expect(result.matrices["해외×제품"].entries).toHaveLength(1);
    expect(result.matrices["해외×상품"].entries).toHaveLength(1);
  });
});

describe("calcPortfolioMatrix — 가중 vs 산술 평균 (보완 3)", () => {
  it("가중 마진 = 영업이익 합 / 매출액 합", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "큰 매출 저마진", 10000, 100),  // 1%
      makeRec("제품", "일반매출", "P002", "작은 매출 고마진", 100, 50),   // 50%
    ];
    const result = calcPortfolioMatrix(data);
    const m = result.matrices["내수×제품"];
    // 가중 마진 = 150 / 10100 = 1.485...%
    expect(m.weightedMarginRate).toBeCloseTo(1.485, 1);
    // 산술 평균 = (1 + 50) / 2 = 25.5%
    expect(m.arithmeticMarginRate).toBeCloseTo(25.5, 1);
    // 두 값 차이가 큼 (가중이 정확)
    expect(Math.abs(m.weightedMarginRate - m.arithmeticMarginRate)).toBeGreaterThan(20);
  });
});

describe("calcPortfolioMatrix — Pareto 80/20", () => {
  it("Top 매출 누적 80%까지만 isPareto80=true", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "Top1", 8000, 100),  // 80%
      makeRec("제품", "일반매출", "P002", "Top2", 1000, 10),   // +10% = 90%
      makeRec("제품", "일반매출", "P003", "Top3", 1000, 10),   // +10% = 100%
    ];
    const result = calcPortfolioMatrix(data, { enablePareto: true });
    const m = result.matrices["내수×제품"];
    const top1 = m.entries.find(e => e.itemCode === "P001")!;
    expect(top1.isPareto80).toBe(true);  // 80% 누적
  });

  it("enablePareto=false → 모두 false", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "Top1", 8000, 100),
    ];
    const result = calcPortfolioMatrix(data, { enablePareto: false });
    const m = result.matrices["내수×제품"];
    expect(m.entries[0].isPareto80).toBe(false);
  });
});

describe("calcPortfolioMatrix — Dynamic BCG (보완 2)", () => {
  it("거래월 6개+ → trendDirection 계산", () => {
    // 같은 품목을 6개월에 걸쳐 매출
    const data: CustomerItemDetailRecord[] = [];
    const months = ["202501", "202502", "202503", "202504", "202505", "202506"];
    for (const m of months) {
      data.push(makeRec("제품", "일반매출", "P001", "Trend품목", 1000, 100, m));
    }
    const result = calcPortfolioMatrix(data, { enableDynamic: true, dynamicMinMonths: 6 });
    const m = result.matrices["내수×제품"];
    const entry = m.entries[0];
    expect(entry.monthCount).toBe(6);
    expect(["improving", "stable", "declining"]).toContain(entry.trendDirection);
    expect(entry.prevSales).toBeDefined();
    expect(entry.currSales).toBeDefined();
  });

  it("거래월 5개 → insufficient_data (Dynamic 미적용)", () => {
    const data: CustomerItemDetailRecord[] = [];
    const months = ["202501", "202502", "202503", "202504", "202505"];
    for (const m of months) {
      data.push(makeRec("제품", "일반매출", "P001", "단기 품목", 1000, 100, m));
    }
    const result = calcPortfolioMatrix(data, { enableDynamic: true, dynamicMinMonths: 6 });
    const m = result.matrices["내수×제품"];
    expect(m.entries[0].trendDirection).toBe("insufficient_data");
    expect(m.entries[0].prevSales).toBeUndefined();
    expect(result.overallSummary.insufficientDataItems).toBe(1);
  });

  it("매출 + 마진 모두 증가 → improving", () => {
    const data: CustomerItemDetailRecord[] = [];
    // 1-3월 매출 1000, 마진 5% / 4-6월 매출 2000, 마진 10% (둘 다 증가)
    for (const m of ["202501", "202502", "202503"]) {
      data.push(makeRec("제품", "일반매출", "P001", "성장품목", 1000, 50, m));
    }
    for (const m of ["202504", "202505", "202506"]) {
      data.push(makeRec("제품", "일반매출", "P001", "성장품목", 2000, 200, m));
    }
    const result = calcPortfolioMatrix(data, { enableDynamic: true, dynamicMinMonths: 6 });
    expect(result.matrices["내수×제품"].entries[0].trendDirection).toBe("improving");
  });
});

describe("calcPortfolioMatrix — 사분면 분류 + 임계", () => {
  it("median 임계로 4 사분면 분포 균형", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "Star", 10000, 1000),       // 큰매출+고마진
      makeRec("제품", "일반매출", "P002", "Cash Cow", 8000, 80),     // 큰매출+저마진
      makeRec("제품", "일반매출", "P003", "Question", 100, 50),      // 작은매출+고마진
      makeRec("제품", "일반매출", "P004", "Dog", 50, 0),             // 작은매출+저마진
    ];
    const result = calcPortfolioMatrix(data, { salesThresholdMode: "median", marginThresholdMode: "median" });
    const m = result.matrices["내수×제품"];
    // 4 품목이 4 사분면에 분포
    expect(m.quadrantStats.star.count + m.quadrantStats.cash_cow.count +
           m.quadrantStats.problem_child.count + m.quadrantStats.dog.count).toBe(4);
  });

  it("custom 임계 (number 직접 지정)", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "A", 1000, 100),
      makeRec("제품", "일반매출", "P002", "B", 500, 50),
    ];
    const result = calcPortfolioMatrix(data, { salesThresholdMode: 800, marginThresholdMode: 7 });
    const m = result.matrices["내수×제품"];
    const a = m.entries.find(e => e.itemCode === "P001")!;
    const b = m.entries.find(e => e.itemCode === "P002")!;
    // A: 1000 >= 800, 10% >= 7% → star
    expect(a.quadrant).toBe("star");
    // B: 500 < 800, 10% >= 7% → problem_child
    expect(b.quadrant).toBe("problem_child");
  });

  it("zero 임계 (적자 vs 흑자)", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "흑자", 1000, 50),
      makeRec("제품", "일반매출", "P002", "적자", 1000, -100),
    ];
    const result = calcPortfolioMatrix(data, { marginThresholdMode: "zero" });
    const m = result.matrices["내수×제품"];
    const blackProf = m.entries.find(e => e.itemCode === "P001")!;
    const redProf = m.entries.find(e => e.itemCode === "P002")!;
    // 흑자 (마진 > 0) → star or problem_child
    expect(["star", "problem_child"]).toContain(blackProf.quadrant);
    // 적자 (마진 < 0) → cash_cow or dog
    expect(["cash_cow", "dog"]).toContain(redProf.quadrant);
  });
});

describe("calcPortfolioMatrix — 사분면 통계", () => {
  it("quadrantStats sales/profit 합산 정확", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "Star1", 10000, 1000),
      makeRec("제품", "일반매출", "P002", "Star2", 12000, 1500),
      makeRec("제품", "일반매출", "P003", "Dog", 100, -50),
    ];
    const result = calcPortfolioMatrix(data);
    const m = result.matrices["내수×제품"];
    // 총 매출 = 22100
    expect(m.totalSales).toBe(22100);
    // 사분면 매출 비중 합 = 1.0
    const totalShare = Object.values(m.quadrantStats).reduce((s, q) => s + q.salesShare, 0);
    expect(totalShare).toBeCloseTo(1.0, 5);
  });
});

describe("calcPortfolioMatrix — 음수 원가 자동 제외 (수학/회계/비즈니스 reconciliation)", () => {
  it("매출원가 < 0 → 차트에서 자동 제외 (excludedNegativeCostItems 카운트)", () => {
    // 사용자 화면 케이스: 매출 5,310,000 / 원가 -6,119,344 / 영업이익 9,765,048
    // 산식 (매출 - 매출원가) = 5,310,000 - (-6,119,344) = 11,429,344
    // → 매출총이익율 215% (매출보다 큰 이익) — 수학상 a-(-b)=a+b는 정확하나 비즈니스 비현실적
    // → 환입/조정 분개 누적된 회계 데이터 이상 → 차트에서 제외하고 통계만 카운트
    const r = makeRec("제품", "일반매출", "P001", "음수원가품목", 5310000, 9765048);
    r.실적매출원가 = { 계획: 0, 실적: -6119344, 차이: 0 };
    const result = calcPortfolioMatrix([r]);

    // 차트 entries에서 제외됨
    expect(result.matrices["내수×제품"].entries).toHaveLength(0);
    // excludedNegativeCostItems 통계로만 카운트
    expect(result.overallSummary.excludedNegativeCostItems).toBe(1);
    // entries에 없으므로 negativeCostCount는 0 (중복 카운트 방지)
    expect(result.overallSummary.negativeCostCount).toBe(0);
  });

  it("정상 원가 (양수) → 차트에 포함 + hasNegativeCost=false", () => {
    const r = makeRec("제품", "일반매출", "P001", "정상", 10000, 1000);
    const result = calcPortfolioMatrix([r]);
    expect(result.matrices["내수×제품"].entries).toHaveLength(1);
    expect(result.matrices["내수×제품"].entries[0].hasNegativeCost).toBe(false);
    expect(result.overallSummary.excludedNegativeCostItems).toBe(0);
  });

  it("excludedNegativeCostItems = 모든 segment 음수원가 제외 합", () => {
    const data: CustomerItemDetailRecord[] = [];
    // 음수 원가 2건 (segment 다름)
    const r1 = makeRec("제품", "일반매출", "P001", "음수1", 1000, 500);
    r1.실적매출원가 = { 계획: 0, 실적: -200, 차이: 0 };
    data.push(r1);
    const r2 = makeRec("상품", "해외매출", "P002", "음수2", 5000, 3000);
    r2.실적매출원가 = { 계획: 0, 실적: -100, 차이: 0 };
    data.push(r2);
    // 정상 1건 (제외되지 않음)
    data.push(makeRec("제품", "일반매출", "P003", "정상", 1000, 100));

    const result = calcPortfolioMatrix(data);
    // 음수 원가 2건 자동 제외 통계
    expect(result.overallSummary.excludedNegativeCostItems).toBe(2);
    // 차트에는 정상 품목 1건만 (내수×제품)
    expect(result.matrices["내수×제품"].entries).toHaveLength(1);
    // 해외×상품 segment에 있던 음수 원가는 제외 → 빈 segment
    expect(result.matrices["해외×상품"].entries).toHaveLength(0);
    // negativeCostCount는 entries 기반이므로 0 (중복 방지)
    expect(result.overallSummary.negativeCostCount).toBe(0);
  });

  it("음수 원가 + 정상 원가 혼합 → 정상만 분석, 평균/임계 왜곡 없음", () => {
    const data: CustomerItemDetailRecord[] = [];
    // 정상 품목 (마진 10%)
    data.push(makeRec("제품", "일반매출", "P001", "정상1", 1000, 100));
    data.push(makeRec("제품", "일반매출", "P002", "정상2", 2000, 200));
    // 음수 원가 (215% 비현실적 마진 — 제외 안 하면 평균 왜곡)
    const r3 = makeRec("제품", "일반매출", "P003", "음수원가", 5310000, 9765048);
    r3.실적매출원가 = { 계획: 0, 실적: -6119344, 차이: 0 };
    data.push(r3);

    const result = calcPortfolioMatrix(data);
    const m = result.matrices["내수×제품"];
    // 음수 원가 제외 → entries 2건만
    expect(m.entries).toHaveLength(2);
    // 가중 마진 = 300 / 3000 = 10% (음수 원가 9.76M 제외돼야 정상)
    expect(m.weightedMarginRate).toBeCloseTo(10, 1);
    // 산술 평균도 10% (각각 10%)
    expect(m.arithmeticMarginRate).toBeCloseTo(10, 1);
  });
});

describe("calcPortfolioMatrix — 매출총이익 + 매출총이익율 명확화", () => {
  it("매출총이익 = 매출 - 매출원가, 매출총이익율 정확", () => {
    const r = makeRec("제품", "일반매출", "P001", "정상", 10000, 1000);
    // makeRec default: 매출원가 = 매출 - 영업이익 = 9000
    const result = calcPortfolioMatrix([r]);
    const e = result.matrices["내수×제품"].entries[0];
    expect(e.cost).toBe(9000);
    expect(e.grossProfit).toBe(1000);
    expect(e.grossMarginRate).toBeCloseTo(10, 1);
    expect(e.marginRate).toBeCloseTo(10, 1); // 영업이익율
  });

  it("원가 0 → 매출총이익 = 매출 (매출총이익율 100%)", () => {
    const r = makeRec("제품", "일반매출", "P001", "원가 0", 10000, 9500);
    r.실적매출원가 = { 계획: 0, 실적: 0, 차이: 0 };
    const result = calcPortfolioMatrix([r]);
    const e = result.matrices["내수×제품"].entries[0];
    expect(e.cost).toBe(0);
    expect(e.grossProfit).toBe(10000);
    expect(e.grossMarginRate).toBeCloseTo(100, 1);
    expect(e.marginRate).toBeCloseTo(95, 1); // 영업이익율 95%
  });
});

describe("calcPortfolioMatrix — 원가 미계상 식별 (hasMissingCost)", () => {
  it("매출>0 + 원가=0 + 마진≥90% → hasMissingCost=true", () => {
    const data = [
      // 정상 품목: 원가 있음
      makeRec("제품", "일반매출", "P001", "정상", 10000, 100),
    ];
    // 원가 미계상 품목 (rec.실적매출원가.실적 = 0이 default)
    const missingRec = makeRec("제품", "일반매출", "P002", "미계상", 10000, 9500); // 마진 95%
    missingRec.실적매출원가 = { 계획: 0, 실적: 0, 차이: 0 };
    data.push(missingRec);

    const result = calcPortfolioMatrix(data);
    const m = result.matrices["내수×제품"];
    const missing = m.entries.find(e => e.itemCode === "P002");
    expect(missing?.hasMissingCost).toBe(true);
    expect(missing?.cost).toBe(0);

    const normal = m.entries.find(e => e.itemCode === "P001");
    // 정상 품목은 makeRec에서 cost = sales - profit = 10000 - 100 = 9900
    expect(normal?.hasMissingCost).toBe(false);
  });

  it("마진 80% (90% 미만) + 원가 0 → hasMissingCost=false (판정 임계 미달)", () => {
    const data: CustomerItemDetailRecord[] = [];
    const r = makeRec("제품", "일반매출", "P003", "80% 마진", 10000, 8000); // 80%
    r.실적매출원가 = { 계획: 0, 실적: 0, 차이: 0 };
    data.push(r);

    const result = calcPortfolioMatrix(data);
    const entry = result.matrices["내수×제품"].entries[0];
    expect(entry.hasMissingCost).toBe(false);
  });

  it("overallSummary.missingCostCount = 모든 segment 합", () => {
    const data: CustomerItemDetailRecord[] = [];
    const r1 = makeRec("제품", "일반매출", "P001", "미계상1", 10000, 9500);
    r1.실적매출원가 = { 계획: 0, 실적: 0, 차이: 0 };
    data.push(r1);
    const r2 = makeRec("상품", "해외매출", "P002", "미계상2", 5000, 4800);
    r2.실적매출원가 = { 계획: 0, 실적: 0, 차이: 0 };
    data.push(r2);

    const result = calcPortfolioMatrix(data);
    expect(result.overallSummary.missingCostCount).toBe(2);
  });
});

describe("calcPortfolioMatrix — Outlier 제외 산술 평균 (B-Improve-4)", () => {
  it("|마진|>100% outlier 식별 + 제외 산술 평균 정확", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "정상1", 1000, 100),    // 10%
      makeRec("제품", "일반매출", "P002", "정상2", 2000, 100),    // 5%
      makeRec("제품", "일반매출", "P003", "정상3", 1500, 150),    // 10%
      makeRec("제품", "일반매출", "P004", "outlier", 100, -3000), // -3000% (|>100%|)
    ];
    const result = calcPortfolioMatrix(data);
    const m = result.matrices["내수×제품"];
    // outlier 제외 산술: (10 + 5 + 10) / 3 = 8.33%
    expect(m.arithmeticMarginExOutlier).toBeCloseTo(8.33, 1);
    expect(m.outlierCount).toBe(1);
    // 원본 산술: outlier 포함 → 크게 왜곡
    expect(m.arithmeticMarginRate).toBeLessThan(-500);
  });

  it("outlier 0건 시 원본 산술 = 제외 산술", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "정상1", 1000, 50),
      makeRec("제품", "일반매출", "P002", "정상2", 2000, 100),
    ];
    const result = calcPortfolioMatrix(data);
    const m = result.matrices["내수×제품"];
    expect(m.outlierCount).toBe(0);
    expect(m.arithmeticMarginRate).toBeCloseTo(m.arithmeticMarginExOutlier, 5);
  });

  it("overallSummary.outlierCount = 모든 segment outlier 합", () => {
    const data = [
      makeRec("제품", "일반매출", "P001", "정상", 1000, 50),
      makeRec("제품", "일반매출", "P002", "outlier1", 100, -300),  // -300%
      makeRec("상품", "일반매출", "P003", "outlier2", 50, -200),   // -400%
    ];
    const result = calcPortfolioMatrix(data);
    expect(result.overallSummary.outlierCount).toBe(2);
  });
});

describe("getQuadrantKoreanName & Action (UI 헬퍼)", () => {
  it("4 사분면 한글 + 액션", () => {
    expect(getQuadrantKoreanName("star")).toContain("스타");
    expect(getQuadrantKoreanName("cash_cow")).toContain("캐시카우");
    expect(getQuadrantKoreanName("problem_child")).toContain("문제아동");
    expect(getQuadrantKoreanName("dog")).toContain("낙오자");

    expect(getQuadrantAction("star")).toContain("투자");
    expect(getQuadrantAction("cash_cow")).toContain("마진");
    expect(getQuadrantAction("problem_child")).toContain("선별");
    expect(getQuadrantAction("dog")).toContain("정리");
  });
});

describe("calcPortfolioMatrix — 실데이터 시뮬레이션", () => {
  it("내수×제품 가중 마진 5% 시나리오 (실데이터 베이스)", () => {
    // 실데이터: 내수×제품 230 품목 / 매출 56.81억 / 영업이익 +2.84억 / 마진 5.0%
    // 합성: 매출 5,681,000, 영업이익 +284,000 → 마진 5.0%
    const data: CustomerItemDetailRecord[] = [];
    for (let i = 0; i < 100; i++) {
      data.push(makeRec("제품", "일반매출", `P${i}`, `품목${i}`, 56810, i * 10 - 200));
    }
    const result = calcPortfolioMatrix(data);
    const m = result.matrices["내수×제품"];
    expect(m.entries.length).toBe(100);
    expect(m.totalSales).toBe(5681000);
    // 가중 마진 합리적 범위
    expect(m.weightedMarginRate).toBeGreaterThan(-10);
    expect(m.weightedMarginRate).toBeLessThan(20);
  });
});
