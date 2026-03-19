/**
 * portfolioOptimization.ts — 품목 포트폴리오 최적화 분석
 *
 * 5축 복합 스코어링으로 FOCUS/MAINTAIN/OPTIMIZE/DISCONTINUE 분류.
 * 200.품목별 수익성 분석(회계) 데이터 기반.
 *
 * 기존 분석 참조:
 *  - calcProfitMatrix() 4사분면 → quadrant 보조 지표
 *  - calcMarginErosion() → 마진 침식 품목 경고
 */
import type { ItemProfitabilityRecord } from "@/types";
import { calcProfitMatrix, type ProfitMatrixItem } from "./itemHierarchy";
import { calcMarginErosion } from "./detailedProfitAnalysis";

// ─── Types ────────────────────────────────────────────

export type PortfolioAction = "FOCUS" | "MAINTAIN" | "OPTIMIZE" | "DISCONTINUE";

export interface PortfolioScores {
  sales: number;
  profit: number;
  growth: number;
  cost: number;
  plan: number;
}

export interface PortfolioItem {
  품목: string;
  대분류: string;
  조직: string;
  sales: number;
  operatingMargin: number;
  growthRate: number;
  costEfficiency: number;
  planAchievement: number;
  compositeScore: number;
  action: PortfolioAction;
  scores: PortfolioScores;
  quadrant?: "star" | "cashcow" | "question" | "dog";
  marginErosion?: number; // 마진 침식률 (음수=침식)
}

export interface CategorySummary {
  category: string;
  total: number;
  focus: number;
  maintain: number;
  optimize: number;
  discontinue: number;
  focusRate: number;
  discontinueRate: number;
}

export interface PortfolioResult {
  items: PortfolioItem[];
  summary: {
    focus: number;
    maintain: number;
    optimize: number;
    discontinue: number;
    focusCount: number;      // FOCUS 품목의 총 매출
    discontinueSavings: number;
    erosionWarningCount: number; // 마진 침식 경고 품목 수
  };
  topFocus: PortfolioItem[];
  topDiscontinue: PortfolioItem[];
  categorySummary: CategorySummary[];
}

// ─── Helpers ──────────────────────────────────────────

/**
 * percentileRank: 값 배열에서 특정 값의 백분위 (0~100)
 * 동일값 처리: (below + 0.5 * equal) / total * 100 (midrank 방식)
 */
function percentileRank(values: number[], target: number): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < target) below++;
    else if (v === target) equal++;
  }
  return ((below + 0.5 * equal) / sorted.length) * 100;
}

/** 안전한 나눗셈 — NaN/Infinity 방지 */
function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0 || !isFinite(numerator) || !isFinite(denominator)) return fallback;
  const result = numerator / denominator;
  return isFinite(result) ? result : fallback;
}

/** 품목별 월별 매출을 집계하여 성장률 산출 */
function calcGrowthByItem(
  records: ItemProfitabilityRecord[]
): Map<string, number> {
  // 품목+조직 키 → month → 매출
  const monthMap = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (!r.month) continue;
    const key = `${r.품목}||${r.영업조직팀}`;
    if (!monthMap.has(key)) monthMap.set(key, new Map());
    const m = monthMap.get(key)!;
    m.set(r.month, (m.get(r.month) || 0) + r.매출액);
  }

  const result = new Map<string, number>();
  for (const [key, months] of Array.from(monthMap.entries())) {
    const sorted = Array.from(months.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    if (sorted.length < 2) {
      result.set(key, 0);
      continue;
    }
    // 최근 3개월 vs 이전 기간 비교 (3개월 미만이면 전체 half-split)
    const recentCount = Math.min(3, Math.floor(sorted.length / 2));
    const recentStart = sorted.length - recentCount;
    const first = sorted.slice(0, recentStart).reduce((s, [, v]) => s + v, 0);
    const second = sorted.slice(recentStart).reduce((s, [, v]) => s + v, 0);
    // 비교 기간 보정: 기간이 다를 수 있으므로 월평균 기준
    const firstAvg = safeDivide(first, recentStart);
    const secondAvg = safeDivide(second, recentCount);
    const growth = firstAvg > 0
      ? safeDivide((secondAvg - firstAvg), firstAvg) * 100
      : secondAvg > 0 ? 100 : 0;
    result.set(key, growth);
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────

export function calcPortfolioOptimization(
  data: ItemProfitabilityRecord[]
): PortfolioResult {
  const emptyResult: PortfolioResult = {
    items: [],
    summary: { focus: 0, maintain: 0, optimize: 0, discontinue: 0, focusCount: 0, discontinueSavings: 0, erosionWarningCount: 0 },
    topFocus: [],
    topDiscontinue: [],
    categorySummary: [],
  };

  if (data.length === 0) return emptyResult;

  // 기존 분석 참조: 4사분면 분류
  const profitMatrix = calcProfitMatrix(data);
  const quadrantMap = new Map<string, ProfitMatrixItem["quadrant"]>();
  for (const pm of profitMatrix) {
    quadrantMap.set(pm.name, pm.quadrant);
  }

  // 기존 분석 참조: 마진 침식
  const erosionItems = calcMarginErosion(data as any, "product", 9999);
  const erosionMap = new Map<string, number>();
  for (const e of erosionItems) {
    erosionMap.set(e.name, e.erosion);
  }

  // 1) 품목+조직 단위로 집계
  const agg = new Map<
    string,
    {
      품목: string;
      대분류: string;
      조직: string;
      sales: number;
      cost: number;
      grossProfit: number;
      operatingProfit: number;
      salesPlan: number;
    }
  >();

  for (const r of data) {
    const key = `${r.품목}||${r.영업조직팀}`;
    const prev = agg.get(key) || {
      품목: r.품목,
      대분류: r.대분류 || "미분류",
      조직: r.영업조직팀,
      sales: 0,
      cost: 0,
      grossProfit: 0,
      operatingProfit: 0,
      salesPlan: 0,
    };
    prev.sales += r.매출액;
    prev.cost += r.실적매출원가;
    prev.grossProfit += r.매출총이익;
    prev.operatingProfit += r.영업이익;
    prev.salesPlan += r.매출액_계획 || 0;
    agg.set(key, prev);
  }

  // 매출 0인 품목 제외
  const items = Array.from(agg.values()).filter((it) => it.sales !== 0);
  if (items.length === 0) return emptyResult;

  // 2) 성장률 계산
  const growthMap = calcGrowthByItem(data);

  // 3) 각 축 raw 값 배열 (사전 계산으로 percentileRank 호출 최적화)
  const rawValues = items.map((it) => {
    const key = `${it.품목}||${it.조직}`;
    return {
      sales: it.sales,
      opMargin: safeDivide(it.operatingProfit, it.sales) * 100,
      costEff: (1 - safeDivide(it.cost, it.sales)) * 100,
      growth: growthMap.get(key) || 0,
      plan: it.salesPlan > 0 ? safeDivide(it.sales, it.salesPlan) * 100 : 50,
    };
  });

  const salesArr = rawValues.map((v) => v.sales);
  const opMarginArr = rawValues.map((v) => v.opMargin);
  const costEffArr = rawValues.map((v) => v.costEff);
  const growthArr = rawValues.map((v) => v.growth);
  const planArr = rawValues.map((v) => v.plan);

  // 중위 매출
  const sortedSales = [...salesArr].sort((a, b) => a - b);
  const medianSales = sortedSales[Math.floor(sortedSales.length / 2)] || 0;
  // 하위 10% 매출
  const p10Idx = Math.floor(sortedSales.length * 0.1);
  const p10Sales = sortedSales[p10Idx] || 0;

  // 4) 복합 점수 산정
  const portfolioItems: PortfolioItem[] = items.map((it, i) => {
    const rv = rawValues[i];

    const scores: PortfolioScores = {
      sales: percentileRank(salesArr, rv.sales),
      profit: percentileRank(opMarginArr, rv.opMargin),
      growth: percentileRank(growthArr, rv.growth),
      cost: percentileRank(costEffArr, rv.costEff),
      plan: percentileRank(planArr, rv.plan),
    };

    const composite =
      scores.sales * 0.3 +
      scores.profit * 0.25 +
      scores.growth * 0.2 +
      scores.cost * 0.15 +
      scores.plan * 0.1;

    // 전략 분류
    let action: PortfolioAction;
    if (composite < 30 || (it.sales < p10Sales && rv.opMargin < 0)) {
      action = "DISCONTINUE";
    } else if (composite >= 70) {
      action = "FOCUS";
    } else if (composite >= 50) {
      action = "MAINTAIN";
    } else {
      // 30~50: 매출이 중위 이상이면 OPTIMIZE, 아니면 DISCONTINUE
      action = it.sales >= medianSales ? "OPTIMIZE" : "DISCONTINUE";
    }

    return {
      품목: it.품목,
      대분류: it.대분류,
      조직: it.조직,
      sales: it.sales,
      operatingMargin: rv.opMargin,
      growthRate: rv.growth,
      costEfficiency: rv.costEff,
      planAchievement: rv.plan,
      compositeScore: composite,
      action,
      scores,
      quadrant: quadrantMap.get(it.품목),
      marginErosion: erosionMap.get(it.품목),
    };
  });

  // 5) Summary
  const focusItems = portfolioItems.filter((it) => it.action === "FOCUS");
  const discItems = portfolioItems.filter((it) => it.action === "DISCONTINUE");
  const erosionWarnings = portfolioItems.filter(
    (it) => it.marginErosion !== undefined && it.marginErosion < -5
  );

  const summary = {
    focus: focusItems.length,
    maintain: portfolioItems.filter((it) => it.action === "MAINTAIN").length,
    optimize: portfolioItems.filter((it) => it.action === "OPTIMIZE").length,
    discontinue: discItems.length,
    focusCount: focusItems.reduce((s, it) => s + it.sales, 0),
    discontinueSavings: discItems.reduce((s, it) => {
      const orig = items.find(
        (o) => o.품목 === it.품목 && o.조직 === it.조직
      );
      return s + (orig ? Math.abs(orig.cost) : 0);
    }, 0),
    erosionWarningCount: erosionWarnings.length,
  };

  // 6) Top lists
  const sorted = [...portfolioItems].sort(
    (a, b) => b.compositeScore - a.compositeScore
  );
  const topFocus = sorted.filter((it) => it.action === "FOCUS").slice(0, 50);
  const topDiscontinue = [...portfolioItems]
    .sort((a, b) => a.compositeScore - b.compositeScore)
    .filter((it) => it.action === "DISCONTINUE")
    .slice(0, 50);

  // 7) 대분류별 요약
  const catMap = new Map<string, { total: number; focus: number; maintain: number; optimize: number; discontinue: number }>();
  for (const it of portfolioItems) {
    const cat = it.대분류 || "미분류";
    const prev = catMap.get(cat) || { total: 0, focus: 0, maintain: 0, optimize: 0, discontinue: 0 };
    prev.total++;
    prev[it.action.toLowerCase() as "focus" | "maintain" | "optimize" | "discontinue"]++;
    catMap.set(cat, prev);
  }
  const categorySummary: CategorySummary[] = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      ...v,
      focusRate: v.total > 0 ? (v.focus / v.total) * 100 : 0,
      discontinueRate: v.total > 0 ? (v.discontinue / v.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return { items: portfolioItems, summary, topFocus, topDiscontinue, categorySummary };
}
