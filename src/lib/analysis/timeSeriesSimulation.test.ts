import { describe, it, expect } from "vitest";
import {
  calcTimeSeriesSimulation,
  wrightLearningCurve,
  costLagFactor,
  getSeasonalFactor,
  extractSeasonalPattern,
  summarizeBEP,
  DEFAULT_LEARNING_RATE,
  DEFAULT_HORIZON,
  LEARNING_RATE_MIN,
  LEARNING_RATE_MAX,
} from "./timeSeriesSimulation";

describe("wrightLearningCurve", () => {
  it("학습률 1.0 (학습 없음): factor 항상 1", () => {
    expect(wrightLearningCurve(1, 1.0)).toBe(1);
    expect(wrightLearningCurve(2, 1.0)).toBe(1);
    expect(wrightLearningCurve(8, 1.0)).toBe(1);
  });
  it("학습률 0.85: 누적 2배 → factor ~0.85", () => {
    expect(wrightLearningCurve(2, 0.85)).toBeCloseTo(0.85, 4);
    expect(wrightLearningCurve(4, 0.85)).toBeCloseTo(0.85 ** 2, 4);
  });
  it("학습률 0.50: 누적 2배 → factor 0.5", () => {
    expect(wrightLearningCurve(2, 0.5)).toBeCloseTo(0.5, 4);
  });
  it("cumQtyRatio 0/음수 방어 → 1", () => {
    expect(wrightLearningCurve(0, 0.85)).toBe(1);
    expect(wrightLearningCurve(-1, 0.85)).toBe(1);
  });
  it("학습률 클램핑 [0.5, 1.0]", () => {
    expect(wrightLearningCurve(2, 0.3)).toBeCloseTo(0.5, 3); // 0.3 → 0.5
    expect(wrightLearningCurve(2, 1.5)).toBe(1); // 1.5 → 1.0 → factor 1
  });
});

describe("costLagFactor", () => {
  it("lag 0 → 즉시 100% (factor=1)", () => {
    expect(costLagFactor(1, 0)).toBe(1);
    expect(costLagFactor(12, 0)).toBe(1);
  });
  it("lag 3 → t=1 0.33, t=2 0.67, t=3 1.0, t=4+ 1.0", () => {
    expect(costLagFactor(1, 3)).toBeCloseTo(0.333, 2);
    expect(costLagFactor(2, 3)).toBeCloseTo(0.667, 2);
    expect(costLagFactor(3, 3)).toBe(1);
    expect(costLagFactor(4, 3)).toBe(1);
  });
  it("lag 12 → t=12까지 ramp", () => {
    expect(costLagFactor(6, 12)).toBe(0.5);
    expect(costLagFactor(12, 12)).toBe(1);
  });
});

describe("getSeasonalFactor", () => {
  it("패턴 없음 → 1.0", () => {
    expect(getSeasonalFactor(undefined, 5)).toBe(1.0);
    expect(getSeasonalFactor([], 5)).toBe(1.0);
  });
  it("매칭되는 monthIndex factor 반환", () => {
    const p = [
      { monthIndex: 1, factor: 1.2 },
      { monthIndex: 7, factor: 0.7 },
    ];
    expect(getSeasonalFactor(p, 1)).toBe(1.2);
    expect(getSeasonalFactor(p, 7)).toBe(0.7);
  });
  it("매칭 안되면 1.0 폴백", () => {
    expect(getSeasonalFactor([{ monthIndex: 1, factor: 1.2 }], 5)).toBe(1.0);
  });
});

describe("extractSeasonalPattern", () => {
  it("decomp null/minimal → undefined", () => {
    expect(extractSeasonalPattern(null)).toBeUndefined();
    expect(extractSeasonalPattern({ points: [], seasonalPattern: [], trendDirection: "flat", seasonalStrength: 0, dataQuality: "minimal" })).toBeUndefined();
  });
  it("limited+ → seasonalPattern 반환", () => {
    const decomp = {
      points: [],
      seasonalPattern: [{ monthIndex: 1, factor: 1.1 }],
      trendDirection: "up" as const,
      seasonalStrength: 0.3,
      dataQuality: "limited" as const,
    };
    expect(extractSeasonalPattern(decomp)).toEqual([{ monthIndex: 1, factor: 1.1 }]);
  });
});

describe("calcTimeSeriesSimulation", () => {
  const baseInput = {
    baseQtyAvg: 1000,
    newUnitPrice: 100,
    initialUnitVC: 60,
  };

  describe("기본 시뮬", () => {
    it("12개월 시뮬 + 최종 누적 양수 (단순 케이스)", () => {
      const r = calcTimeSeriesSimulation(baseInput);
      expect(r.months).toHaveLength(DEFAULT_HORIZON);
      expect(r.finalCumulative).toBeGreaterThan(0);
      expect(r.bepMonth).toBe(1); // 즉시 흑자
    });

    it("월별 누적 합계 검증", () => {
      const r = calcTimeSeriesSimulation(baseInput);
      const sumProfit = r.months.reduce((s, m) => s + m.profit, 0);
      expect(r.finalCumulative).toBeCloseTo(sumProfit, 2);
    });

    it("NPV < 단순 누적 (할인율 양수일 때)", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, monthlyDiscountRate: 0.01 });
      expect(r.totalNPV).toBeLessThan(r.finalCumulative);
    });

    it("할인율 0 → NPV = 단순 누적", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, monthlyDiscountRate: 0 });
      expect(r.totalNPV).toBeCloseTo(r.finalCumulative, 2);
    });
  });

  describe("학습곡선 효과", () => {
    it("학습률 1.0 → 모든 월 단위VC 동일", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, learningRate: 1.0 });
      const vcs = r.months.map(m => m.unitVC);
      expect(Math.max(...vcs)).toBeCloseTo(Math.min(...vcs), 4);
      expect(r.averageLearningSavings).toBeCloseTo(0, 4);
    });
    it("학습률 0.85 → 후반 월 단위VC < 초반", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, learningRate: 0.85 });
      expect(r.months[11].unitVC).toBeLessThan(r.months[0].unitVC);
      expect(r.averageLearningSavings).toBeGreaterThan(0);
    });
  });

  describe("원가 lag", () => {
    it("lag 0 → 처음부터 인상 반영", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, totalCostChangePct: 20, lagMonths: 0, learningRate: 1.0 });
      expect(r.months[0].unitVC).toBeCloseTo(60 * 1.2, 1);
    });
    it("lag 3 → M3에서 100% 반영", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, totalCostChangePct: 20, lagMonths: 3, learningRate: 1.0 });
      expect(r.months[0].costLagFactor).toBeCloseTo(0.333, 2);
      expect(r.months[2].costLagFactor).toBe(1);
    });
  });

  describe("계절성 적용", () => {
    it("계절성 패턴 적용 → 월별 baseQty 변동", () => {
      const seasonal = Array.from({ length: 12 }, (_, i) => ({
        monthIndex: i + 1,
        factor: i === 6 ? 0.5 : 1.0, // M7만 비수기
      }));
      const r = calcTimeSeriesSimulation({ ...baseInput, seasonalPattern: seasonal, learningRate: 1.0 });
      expect(r.months[6].baseQty).toBeCloseTo(500, 0); // M7 비수기
      expect(r.months[0].baseQty).toBeCloseTo(1000, 0);
    });
  });

  describe("BEP 시점 판정", () => {
    it("BEP 즉시 도달 (M1 흑자)", () => {
      const r = calcTimeSeriesSimulation(baseInput);
      expect(r.bepMonth).toBe(1);
    });
    it("BEP 미도달 (단가 < 단위VC)", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, newUnitPrice: 50, initialUnitVC: 60, learningRate: 1.0 });
      expect(r.bepMonth).toBe(null);
      expect(r.notes.some(n => n.includes("도달 실패"))).toBe(true);
    });
  });

  describe("엣지 케이스", () => {
    it("baseQtyAvg 0 → 시뮬 불가", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, baseQtyAvg: 0 });
      expect(r.months).toHaveLength(0);
      expect(r.notes.some(n => n.includes("시뮬 불가"))).toBe(true);
    });
    it("newUnitPrice 0 → 시뮬 불가", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, newUnitPrice: 0 });
      expect(r.months).toHaveLength(0);
    });
    it("학습률 0.3 (clamp 0.5)로 작동", () => {
      const r = calcTimeSeriesSimulation({ ...baseInput, learningRate: 0.3 });
      expect(r.months[11].unitVC).toBeGreaterThan(0);
    });
  });
});

describe("summarizeBEP", () => {
  it("null → 미도달 메시지", () => {
    expect(summarizeBEP(null)).toContain("미도달");
  });
  it("M1 → 즉시 흑자", () => {
    expect(summarizeBEP(1)).toContain("즉시");
  });
  it("M6 → 'M6차'", () => {
    expect(summarizeBEP(6)).toContain("M6차");
  });
});

describe("상수 export", () => {
  it("기본값 노출", () => {
    expect(DEFAULT_LEARNING_RATE).toBe(0.90);
    expect(DEFAULT_HORIZON).toBe(12);
    expect(LEARNING_RATE_MIN).toBe(0.5);
    expect(LEARNING_RATE_MAX).toBe(1.0);
  });
});
