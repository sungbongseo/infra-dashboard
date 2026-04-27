/**
 * 12개월 롤링 시뮬레이션 — Wright 학습곡선 + 원가 lag + 계절성 + NPV.
 *
 * v2 WS7 (저가수주 상계 시뮬 Phase C 두 번째).
 *
 * @model
 *   t=1..12 월별 시뮬:
 *     1. baseQty_t = baseQtyAvg × seasonalFactor[m]
 *     2. cumQty_t = Σ baseQty_(1..t)
 *     3. unitVC_t = unitVC_0 × (cumQty_t / cumQty_1) ^ log2(learningRate)
 *     4. costLagFactor_t = min(1, t/lagMonths)        (선형 ramp-up)
 *     5. effectiveCostInflation_t = totalCostChangePct × costLagFactor_t
 *     6. monthlyProfit_t = (newPrice - unitVC_t × (1+infl)) × baseQty_t
 *     7. npvCumulative_t = Σ profit_k / (1+r)^k
 *
 * @design
 *   - WS4 PED 재사용 (가격 변동 → 수량 변동)
 *   - WS6 경쟁사 반응 결과 활용 가능 (선택)
 *   - 14M 데이터로 계절성 추출 (timeSeriesDecomposition)
 */

import type { DecompositionResult } from "./timeSeriesDecomposition";

// ─── Types ───────────────────────────────────────────────

export interface MonthlyPoint {
  month: number;              // 1-12
  monthLabel: string;         // "M1", "M2", ...
  baseQty: number;            // 계절성 반영 월별 수량
  unitVC: number;             // 학습곡선 + costLag 반영 단위 변동비
  unitPrice: number;          // 새 단가 (고정 가정)
  revenue: number;
  variableCost: number;
  profit: number;             // 월별 손익
  cumulativeProfit: number;
  npvCumulative: number;
  learningCurveFactor: number; // unitVC_t / unitVC_0 (감소율)
  costLagFactor: number;       // 0-1 (1=완전 반영)
  seasonalFactor: number;      // 1.0 = 평균
}

export interface TimeSeriesSimulationInput {
  /** 평균 월별 수량 */
  baseQtyAvg: number;
  /** 새 단가 (인하 후) */
  newUnitPrice: number;
  /** 시작 시점 단위 변동비 */
  initialUnitVC: number;
  /** 총 원가 인상률 (%) */
  totalCostChangePct?: number;
  /** 학습률 0.85 = 누적량 2배 시 단위VC 15% 감소 */
  learningRate?: number;
  /** 원가 lag 개월 (선형 ramp-up) */
  lagMonths?: number;
  /** 월 할인율 (NPV) */
  monthlyDiscountRate?: number;
  /** 계절성 패턴 (12개) — timeSeriesDecomposition.seasonalPattern */
  seasonalPattern?: Array<{ monthIndex: number; factor: number }>;
  /** 시뮬 기간 (기본 12개월) */
  horizon?: number;
}

export interface TimeSeriesSimulationResult {
  months: MonthlyPoint[];
  totalRevenue: number;
  totalCost: number;
  totalNPV: number;
  finalCumulative: number;
  bepMonth: number | null;       // 손익분기 도달 월 (null=미도달)
  averageLearningSavings: number; // 학습곡선으로 인한 평균 단위VC 감소율
  notes: string[];
}

// ─── 상수 ────────────────────────────────────────────────

export const DEFAULT_LEARNING_RATE = 0.90;     // 보수적 (10% / 2배)
export const DEFAULT_LAG_MONTHS = 3;
export const DEFAULT_MONTHLY_DISCOUNT = 0.005;  // 월 0.5% (연 ~6%)
export const DEFAULT_HORIZON = 12;

// 학습률 클램핑 [0.5, 1.0]
export const LEARNING_RATE_MIN = 0.5;
export const LEARNING_RATE_MAX = 1.0;

// ─── 헬퍼 ────────────────────────────────────────────────

/** Wright 학습곡선: cumRatio^log2(learningRate) */
export function wrightLearningCurve(cumQtyRatio: number, learningRate: number): number {
  const r = Math.max(LEARNING_RATE_MIN, Math.min(LEARNING_RATE_MAX, learningRate));
  if (cumQtyRatio <= 0) return 1;
  return Math.pow(cumQtyRatio, Math.log2(r));
}

/** 원가 lag 선형 ramp-up: t/lagMonths, 클램핑 [0,1] */
export function costLagFactor(t: number, lagMonths: number): number {
  if (lagMonths <= 0) return 1;
  return Math.max(0, Math.min(1, t / lagMonths));
}

/** 계절성 factor 추출 (없으면 1.0) */
export function getSeasonalFactor(
  pattern: Array<{ monthIndex: number; factor: number }> | undefined,
  monthIndex: number,
): number {
  if (!pattern || pattern.length === 0) return 1.0;
  const found = pattern.find(p => p.monthIndex === monthIndex);
  return found?.factor ?? 1.0;
}

/** decomposition 결과에서 seasonal pattern 추출 (편의 함수) */
export function extractSeasonalPattern(decomp: DecompositionResult | null): Array<{ monthIndex: number; factor: number }> | undefined {
  if (!decomp || decomp.dataQuality === "minimal") return undefined;
  return decomp.seasonalPattern;
}

// ─── 메인 함수 ───────────────────────────────────────────

export function calcTimeSeriesSimulation(input: TimeSeriesSimulationInput): TimeSeriesSimulationResult {
  const {
    baseQtyAvg, newUnitPrice, initialUnitVC,
    totalCostChangePct = 0,
    learningRate = DEFAULT_LEARNING_RATE,
    lagMonths = DEFAULT_LAG_MONTHS,
    monthlyDiscountRate = DEFAULT_MONTHLY_DISCOUNT,
    seasonalPattern,
    horizon = DEFAULT_HORIZON,
  } = input;

  const notes: string[] = [];

  if (baseQtyAvg <= 0 || newUnitPrice <= 0) {
    notes.push("시뮬 불가: 기준 수량 또는 단가 0");
    return {
      months: [], totalRevenue: 0, totalCost: 0, totalNPV: 0,
      finalCumulative: 0, bepMonth: null, averageLearningSavings: 0, notes,
    };
  }

  if (initialUnitVC <= 0) {
    notes.push("초기 변동비 0 — 학습곡선 효과 무시");
  }

  if (!seasonalPattern || seasonalPattern.length === 0) {
    notes.push("계절성 데이터 없음 — 평탄 가정 (factor=1.0)");
  }

  const months: MonthlyPoint[] = [];
  let cumQty = 0;
  let cumProfit = 0;
  let npvCum = 0;
  let bepMonth: number | null = null;
  let learningSavingsSum = 0;

  // M1 누적량 (학습곡선 분모로 사용)
  const m1SeasonalFactor = getSeasonalFactor(seasonalPattern, 1);
  const m1BaseQty = baseQtyAvg * m1SeasonalFactor;

  for (let t = 1; t <= horizon; t++) {
    const seasonalFactor = getSeasonalFactor(seasonalPattern, t);
    const baseQty = baseQtyAvg * seasonalFactor;
    cumQty += baseQty;

    // Wright 학습곡선 (cumQty / m1BaseQty 비율)
    const cumRatio = m1BaseQty > 0 ? cumQty / m1BaseQty : 1;
    const learningFactor = wrightLearningCurve(cumRatio, learningRate);

    // 원가 lag
    const lagFactor = costLagFactor(t, lagMonths);
    const effectiveCostInflation = (totalCostChangePct / 100) * lagFactor;

    // 월별 단위 변동비
    const unitVC = initialUnitVC > 0
      ? initialUnitVC * learningFactor * (1 + effectiveCostInflation)
      : 0;

    learningSavingsSum += (1 - learningFactor);

    const revenue = newUnitPrice * baseQty;
    const variableCost = unitVC * baseQty;
    const profit = revenue - variableCost;
    cumProfit += profit;
    npvCum += profit / Math.pow(1 + monthlyDiscountRate, t);

    if (bepMonth === null && cumProfit >= 0) bepMonth = t;

    months.push({
      month: t,
      monthLabel: `M${t}`,
      baseQty, unitVC, unitPrice: newUnitPrice,
      revenue, variableCost, profit,
      cumulativeProfit: cumProfit,
      npvCumulative: npvCum,
      learningCurveFactor: learningFactor,
      costLagFactor: lagFactor,
      seasonalFactor,
    });
  }

  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const totalCost = months.reduce((s, m) => s + m.variableCost, 0);
  const averageLearningSavings = horizon > 0 ? learningSavingsSum / horizon : 0;

  if (bepMonth === null) notes.push("12개월 내 BEP 도달 실패");

  return {
    months,
    totalRevenue, totalCost,
    totalNPV: npvCum,
    finalCumulative: cumProfit,
    bepMonth,
    averageLearningSavings,
    notes,
  };
}

// ─── UI 헬퍼 ─────────────────────────────────────────────

export function formatMonthLabel(t: number): string {
  return `M${t}`;
}

export function summarizeBEP(bepMonth: number | null): string {
  if (bepMonth === null) return "12개월 내 손익분기 미도달";
  if (bepMonth === 1) return "M1 즉시 흑자";
  return `M${bepMonth}차 손익분기`;
}
