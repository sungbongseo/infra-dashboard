import { describe, it, expect } from "vitest";
import type { CustomerItemDetailRecord } from "@/types";
import {
  pearsonCorrelation,
  regressionSlope,
  calcElasticity,
  calcCannibalRate,
  classifyConfidence,
  buildCustomerItemTimeSeries,
  calcCannibalizationMatrix,
  applyCannibalCorrection,
  calcAllCannibalPresets,
  buildCategoryMap,
  cannibalIntensityLabel,
  correlationLabel,
  PRESETS,
  SAME_CATEGORY_BOOST,
  MIN_SAMPLE_MONTHS,
} from "./cannibalization";

// ─── 헬퍼: CustomerItemDetailRecord 생성 ─────────

function rec(
  customer: string,
  item: string,
  month: string,
  sales: number,
  category: string = "",
): CustomerItemDetailRecord {
  return {
    No: 1,
    영업조직팀: "팀A",
    영업담당사번: "E001",
    month,
    매출거래처: customer,
    매출거래처명: `${customer}_NAME`,
    품목: item,
    품목명: `${item}_NAME`,
    거래처대분류: "",
    거래처중분류: "",
    거래처소분류: "",
    제품군: category,
    매출연월: month,
    계정구분: "",
    매출유형: "",
    품목군: "",
    중분류코드: "",
    공장: "",
    제품내수매출: { 계획: 0, 실적: sales, 차이: 0 },
    제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },
    매출수량: { 계획: 0, 실적: 1, 차이: 0 },
    환산수량: { 계획: 0, 실적: 1, 차이: 0 },
    매출액: { 계획: 0, 실적: sales, 차이: 0 },
    실적매출원가: { 계획: 0, 실적: 0, 차이: 0 },
    상품매입: { 계획: 0, 실적: 0, 차이: 0 },
    매출총이익: { 계획: 0, 실적: 0, 차이: 0 },
    판매관리비: { 계획: 0, 실적: 0, 차이: 0 },
    판관변동_직접판매운반비: { 계획: 0, 실적: 0, 차이: 0 },
    영업이익: { 계획: 0, 실적: 0, 차이: 0 },
  } as CustomerItemDetailRecord;
}

// ─── 통계 헬퍼 테스트 ───────────────────────────

describe("pearsonCorrelation", () => {
  it("완전 양의 상관 → +1", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 5);
  });
  it("완전 음의 상관 → -1", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 5);
  });
  it("무상관 (직교) → 0 근처", () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });
  it("길이 < 2 → 0", () => {
    expect(pearsonCorrelation([1], [2])).toBe(0);
    expect(pearsonCorrelation([], [])).toBe(0);
  });
  it("분산 0 (전월 동일) → 0", () => {
    expect(pearsonCorrelation([5, 5, 5, 5], [1, 2, 3, 4])).toBe(0);
  });
});

describe("regressionSlope", () => {
  it("완전 음의 상관 시 β = -k (k=Var(B) 기반 비율)", () => {
    // A = 4, 3, 2, 1; B = 1, 2, 3, 4 → β = -1 정확
    expect(regressionSlope([4, 3, 2, 1], [1, 2, 3, 4])).toBeCloseTo(-1, 4);
  });
  it("완전 양의 상관 → β > 0", () => {
    expect(regressionSlope([2, 4, 6, 8], [1, 2, 3, 4])).toBeCloseTo(2, 4);
  });
  it("Var(B) = 0 → 0 반환", () => {
    expect(regressionSlope([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe("calcElasticity", () => {
  it("ε = β × meanB / meanA", () => {
    // β = 2, meanA = 100, meanB = 50 → ε = 2 × 50/100 = 1
    expect(calcElasticity(2, 100, 50)).toBeCloseTo(1, 5);
  });
  it("meanA <= 0 → 0", () => {
    expect(calcElasticity(2, 0, 50)).toBe(0);
    expect(calcElasticity(2, -10, 50)).toBe(0);
  });
});

// ─── 카니발 계수 ───────────────────────────────

describe("calcCannibalRate", () => {
  it("양의 상관 → c=0 (보완재)", () => {
    expect(calcCannibalRate(0.5, 1.0, 100, 100, false)).toBe(0);
    expect(calcCannibalRate(0, 1.0, 100, 100, false)).toBe(0);
  });
  it("강한 음의 상관 + 적정 elasticity → c > 0", () => {
    // ρ=-1, β=-1, meanA=100, meanB=100 → ε=-1, c_raw = 1×1 = 1, c=1 (clamped)
    expect(calcCannibalRate(-1, -1, 100, 100, false)).toBeCloseTo(1, 4);
  });
  it("대분류 동일 1.5배 부스트 후 클램핑", () => {
    // ρ=-0.5, β=-0.5, meanA=meanB=100 → ε=-0.5, c_raw=0.25
    // sameCategory: 0.25 × 1.5 = 0.375
    expect(calcCannibalRate(-0.5, -0.5, 100, 100, true)).toBeCloseTo(0.375, 4);
    // sameCategory=false: 0.25
    expect(calcCannibalRate(-0.5, -0.5, 100, 100, false)).toBeCloseTo(0.25, 4);
  });
  it("clamp [0, 1]: 1을 초과하지 않음", () => {
    // 강한 음의 상관 + 큰 elasticity + boost → 1로 클램핑
    expect(calcCannibalRate(-1, -10, 50, 100, true)).toBe(1);
  });
  it("meanA=0 또는 meanB=0 방어 → c=0", () => {
    expect(calcCannibalRate(-1, -1, 0, 100, false)).toBe(0);
    expect(calcCannibalRate(-1, -1, 100, 0, false)).toBe(0);
  });
});

describe("classifyConfidence", () => {
  it("4M low / 8M medium / 12M+ high", () => {
    expect(classifyConfidence(4)).toBe("low");
    expect(classifyConfidence(7)).toBe("low");
    expect(classifyConfidence(8)).toBe("medium");
    expect(classifyConfidence(11)).toBe("medium");
    expect(classifyConfidence(12)).toBe("high");
    expect(classifyConfidence(14)).toBe("high");
  });
});

// ─── 시계열 빌드 ───────────────────────────────

describe("buildCustomerItemTimeSeries", () => {
  it("거래처-품목-월 시계열 정상 추출", () => {
    const data = [
      rec("C1", "I1", "202501", 100),
      rec("C1", "I1", "202502", 110),
      rec("C1", "I2", "202501", 50),
      rec("C2", "I1", "202501", 200),
    ];
    const ts = buildCustomerItemTimeSeries(data);
    expect(ts.size).toBe(2);
    expect(ts.get("C1")?.size).toBe(2);
    expect(ts.get("C1")?.get("I1")?.get("202501")).toBe(100);
    expect(ts.get("C1")?.get("I1")?.get("202502")).toBe(110);
    expect(ts.get("C2")?.get("I1")?.get("202501")).toBe(200);
  });
});

// ─── 매트릭스 통합 테스트 ─────────────────────

describe("calcCannibalizationMatrix", () => {
  it("빈 데이터 → 빈 매트릭스 + note", () => {
    const result = calcCannibalizationMatrix({ data: [] });
    expect(result.matrix).toEqual([]);
    expect(result.itemRiskScores).toEqual([]);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("샘플 < 4M → 매트릭스에서 제외", () => {
    const data = [
      rec("C1", "I1", "202501", 100),
      rec("C1", "I1", "202502", 110),
      rec("C1", "I2", "202501", 50),
      rec("C1", "I2", "202502", 60),
      rec("C1", "I3", "202501", 30),
      rec("C1", "I3", "202502", 40),
    ];
    const result = calcCannibalizationMatrix({ data });
    // 동시 발생 월 = 2 < 4 → 제외
    expect(result.matrix.length).toBe(0);
  });

  it("음의 상관 쌍 → 카니발 매트릭스 포함", () => {
    // I1과 I2가 같은 거래처에서 정확히 반대로 움직임 (4M+)
    const data = [
      rec("C1", "I1", "202501", 100, "P1"),
      rec("C1", "I1", "202502", 80, "P1"),
      rec("C1", "I1", "202503", 60, "P1"),
      rec("C1", "I1", "202504", 40, "P1"),
      rec("C1", "I2", "202501", 40, "P1"),
      rec("C1", "I2", "202502", 60, "P1"),
      rec("C1", "I2", "202503", 80, "P1"),
      rec("C1", "I2", "202504", 100, "P1"),
    ];
    const categoryMap = new Map([["I1", "P1"], ["I2", "P1"]]);
    const result = calcCannibalizationMatrix({ data, itemCategoryMap: categoryMap });
    expect(result.matrix.length).toBeGreaterThanOrEqual(2); // I1↔I2 양방향
    const cell = result.matrix.find(c => c.itemA === "I1" && c.itemB === "I2");
    expect(cell).toBeDefined();
    expect(cell!.correlation).toBeLessThan(-0.9);
    expect(cell!.cannibalRate).toBeGreaterThan(0);
    expect(cell!.sameCategory).toBe(true);
  });

  it("거래처 분리: 거래처별 상관 별도 계산 (-1, +1 평균 → 0)", () => {
    // C1: I1↓ I2↑ → ρ=-1 (음의 상관)
    // C2: I1↑ I2↑ → ρ=+1 (양의 상관, 보완재)
    // 평균 ≈ 0
    const data = [
      // C1: 음의 상관
      rec("C1", "I1", "202501", 100), rec("C1", "I1", "202502", 80),
      rec("C1", "I1", "202503", 60), rec("C1", "I1", "202504", 40),
      rec("C1", "I2", "202501", 40), rec("C1", "I2", "202502", 60),
      rec("C1", "I2", "202503", 80), rec("C1", "I2", "202504", 100),
      // C2: 양의 상관 (둘 다 ↑)
      rec("C2", "I1", "202501", 40), rec("C2", "I1", "202502", 60),
      rec("C2", "I1", "202503", 80), rec("C2", "I1", "202504", 100),
      rec("C2", "I2", "202501", 40), rec("C2", "I2", "202502", 60),
      rec("C2", "I2", "202503", 80), rec("C2", "I2", "202504", 100),
    ];
    const result = calcCannibalizationMatrix({ data });
    const cell = result.matrix.find(c => c.itemA === "I1" && c.itemB === "I2");
    expect(cell).toBeDefined();
    expect(cell!.customerCount).toBe(2);
    // 두 거래처 평균 상관 ≈ 0
    expect(Math.abs(cell!.correlation)).toBeLessThan(0.1);
  });
});

// ─── 카니발 보정 테스트 ────────────────────────

describe("applyCannibalCorrection", () => {
  it("매트릭스 비어있음 → 보정 0, 단독효과 그대로", () => {
    const result = applyCannibalCorrection({
      matrix: [],
      targetItem: "I1",
      aloneEffect: 1000,
      baseSalesTarget: 5000,
      baseSalesMap: new Map([["I2", 2000]]),
      multiplier: 1.0,
    });
    expect(result.cannibalLoss).toBe(0);
    expect(result.portfolioNet).toBe(1000);
    expect(result.cannibalizedTopN).toEqual([]);
  });

  it("target=I1, I2가 c=0.3으로 잠식 → loss = -0.3 × 0.2 × 1000 = -60", () => {
    const matrix = [{
      itemA: "I2", itemAName: "I2_NAME",
      itemB: "I1", itemBName: "I1_NAME",
      correlation: -0.5, cannibalRate: 0.3,
      sameCategory: false, sampleMonths: 8,
      confidenceLevel: "medium" as const, customerCount: 1,
    }];
    const result = applyCannibalCorrection({
      matrix,
      targetItem: "I1",
      aloneEffect: 1000,    // target +1000 매출
      baseSalesTarget: 5000, // baseSales 5000 → 변화율 20%
      baseSalesMap: new Map([["I2", 1000]]),
      multiplier: 1.0,
    });
    // expectedLoss = -0.3 × (1000/5000) × 1000 = -60
    expect(result.cannibalLoss).toBeCloseTo(-60, 2);
    expect(result.portfolioNet).toBeCloseTo(940, 2);
    expect(result.cannibalizedTopN).toHaveLength(1);
    expect(result.cannibalizedTopN[0].item).toBe("I2");
    expect(result.cannibalizedTopN[0].expectedLoss).toBeCloseTo(-60, 2);
  });

  it("multiplier 0.5 적용 시 loss 절반", () => {
    const matrix = [{
      itemA: "I2", itemAName: "I2_NAME",
      itemB: "I1", itemBName: "I1_NAME",
      correlation: -0.5, cannibalRate: 0.4,
      sameCategory: false, sampleMonths: 8,
      confidenceLevel: "medium" as const, customerCount: 1,
    }];
    const r = applyCannibalCorrection({
      matrix, targetItem: "I1",
      aloneEffect: 1000, baseSalesTarget: 5000,
      baseSalesMap: new Map([["I2", 1000]]),
      multiplier: 0.5,
    });
    // loss = -0.4 × 0.5 × 0.2 × 1000 = -40
    expect(r.cannibalLoss).toBeCloseTo(-40, 2);
  });
});

describe("calcAllCannibalPresets", () => {
  it("3 프리셋 multiplier 정확 적용 (loss는 multiplier에 비례)", () => {
    const matrix = [{
      itemA: "I2", itemAName: "I2",
      itemB: "I1", itemBName: "I1",
      correlation: -0.5, cannibalRate: 0.4,
      sameCategory: false, sampleMonths: 10,
      confidenceLevel: "medium" as const, customerCount: 1,
    }];
    const base = {
      matrix, targetItem: "I1",
      aloneEffect: 1000, baseSalesTarget: 5000,
      baseSalesMap: new Map([["I2", 1000]]),
    };
    const cmp = calcAllCannibalPresets(base);
    // loss × multiplier 비례
    expect(cmp.weak.cannibalLoss).toBeCloseTo(cmp.medium.cannibalLoss * 0.5, 2);
    expect(cmp.strong.cannibalLoss).toBeCloseTo(cmp.medium.cannibalLoss * 1.5, 2);
    // 프리셋 multiplier 검증
    expect(cmp.weak.multiplier).toBe(PRESETS.weak.multiplier);
    expect(cmp.medium.multiplier).toBe(PRESETS.medium.multiplier);
    expect(cmp.strong.multiplier).toBe(PRESETS.strong.multiplier);
  });
});

// ─── 카테고리 맵 + UI 헬퍼 ────────────────────

describe("buildCategoryMap", () => {
  it("품목 → 제품군 매핑 생성", () => {
    const data = [
      rec("C1", "I1", "202501", 100, "Cat1"),
      rec("C1", "I2", "202501", 50, "Cat2"),
      rec("C2", "I1", "202502", 80, "Cat1"), // 중복 → 첫 번째 유지
    ];
    const m = buildCategoryMap(data);
    expect(m.get("I1")).toBe("Cat1");
    expect(m.get("I2")).toBe("Cat2");
    expect(m.size).toBe(2);
  });
});

describe("UI 헬퍼", () => {
  it("cannibalIntensityLabel 구간별 레이블", () => {
    expect(cannibalIntensityLabel(0)).toBe("잠식 무시");
    expect(cannibalIntensityLabel(0.5)).toBe("약한 잠식");
    expect(cannibalIntensityLabel(1.0)).toBe("중간 잠식");
    expect(cannibalIntensityLabel(1.5)).toBe("강한 잠식");
    expect(cannibalIntensityLabel(2.0)).toBe("매우 강한 잠식");
  });
  it("correlationLabel 분류", () => {
    expect(correlationLabel(-0.5)).toContain("강한 음");
    expect(correlationLabel(-0.1)).toContain("약한 음");
    expect(correlationLabel(0.1)).toBe("중립");
    expect(correlationLabel(0.5)).toContain("양의 상관");
  });
});

// ─── 상수 검증 ────────────────────────────────

describe("상수", () => {
  it("PRESETS 3종 + 카테고리 부스트 1.5 + 최소 샘플 4M", () => {
    expect(PRESETS.weak.multiplier).toBe(0.5);
    expect(PRESETS.medium.multiplier).toBe(1.0);
    expect(PRESETS.strong.multiplier).toBe(1.5);
    expect(SAME_CATEGORY_BOOST).toBe(1.5);
    expect(MIN_SAMPLE_MONTHS).toBe(4);
  });
});
