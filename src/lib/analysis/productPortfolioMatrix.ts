/**
 * 제품/상품 포트폴리오 매트릭스 — Strategic Quadrant Analysis (SQA).
 *
 * 사용자 요청 BCG 4-way (제품/상품 × 내수/해외) + 정통 BCG 한계 보완 3종:
 *   1) Dynamic BCG — 12M 데이터 → 6M+6M 분할 + 시계열 화살표
 *   2) Weighted Margin — 산술 평균 왜곡 회피 (실측 -9.88%p ~ +5.68%p)
 *   3) Pareto 80/20 — Top 20% 매출 강조
 *
 * @phaseB
 *   B-0 (parser): 매출유형/계정구분 fill-down 추가 (선행)
 *   B-1: 본 모듈 + 단위 테스트
 *   B-2: PortfolioMatrixTab UI
 *   B-3: 진단 + PDCA 보고서
 *
 * @input
 *   CustomerItemDetailRecord[] (100 거래처별 품목별 손익)
 *
 * @output
 *   PortfolioMatrixResult — 4 segment × {entries, stats, thresholds}
 */

import type { CustomerItemDetailRecord } from "@/types";
import { safeDivide } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

export type Segment = "내수×제품" | "내수×상품" | "해외×제품" | "해외×상품";
export type Quadrant = "star" | "cash_cow" | "problem_child" | "dog";
export type TrendDirection = "improving" | "stable" | "declining" | "new" | "insufficient_data";

export interface BCGMatrixEntry {
  // 식별
  segment: Segment;
  itemCode: string;
  itemName: string;
  category: string;       // 제품군 또는 대분류

  // 현재 시점 메트릭 (12M 통합) — 모두 .실적 (Actual)
  sales: number;            // 매출액.실적
  operatingProfit: number;  // 영업이익.실적 (= 매출총이익 - 판관비)
  marginRate: number;       // 영업이익율 (%) = 영업이익 / 매출 × 100
  cost: number;             // 매출원가.실적 합 (원가 미계상 식별용)
  grossProfit: number;      // 매출총이익 (= 매출 - 매출원가)
  grossMarginRate: number;  // 매출총이익율 (%) = 매출총이익 / 매출 × 100

  // 분류
  quadrant: Quadrant;
  isPareto80: boolean;    // 매출 누적 80% 이내?
  /** 원가 0원 + 매출>0 + 마진 90%+ → 회계 미계상 의심 */
  hasMissingCost: boolean;
  /** 매출원가 < 0 → 회계 분개 누적 (환입/조정) — 매출총이익율 100% 초과 발생 */
  hasNegativeCost: boolean;

  // 메타
  monthCount: number;     // 거래월 수 (Dynamic 적용 가능 여부)

  // Dynamic BCG (시계열, 거래월 6+ 시만)
  prevSales?: number;     // 이전 6M 매출
  prevProfit?: number;
  prevMargin?: number;
  currSales?: number;     // 최근 6M 매출
  currProfit?: number;
  currMargin?: number;
  trendDirection: TrendDirection;
}

export interface QuadrantStats {
  count: number;
  sales: number;
  profit: number;
  salesShare: number;     // 사분면 매출 비중 (0-1)
}

export interface SegmentMatrix {
  segment: Segment;
  entries: BCGMatrixEntry[];

  // 가중 통계
  totalSales: number;
  totalProfit: number;
  weightedMarginRate: number;        // = totalProfit / totalSales (정확)
  arithmeticMarginRate: number;      // 산술 평균 (outlier 영향 큼)
  arithmeticMarginExOutlier: number; // outlier 제외 산술 (|마진|≤100%)
  outlierCount: number;              // |마진|>100% 품목 수

  // 사분면별 요약
  quadrantStats: Record<Quadrant, QuadrantStats>;

  // 임계 (분류 기준)
  thresholds: {
    salesThreshold: number;
    marginThreshold: number;
    salesP75: number;     // Pareto 강조용 (참고)
  };
}

/**
 * 회계팀 검증용 anomaly export entry — CSV/XLSX 다운로드 형식.
 *
 * P1-1 (v4 world-class): 음수 원가 + 원가 미계상 품목을 한 번에 export.
 * 음수 원가는 차트에서 자동 제외되지만(productPortfolioMatrix.ts:340-347),
 * 본 배열에는 포함되어 회계팀이 환입·조정 분개 검토 가능.
 */
export interface AnomalyExportEntry {
  segment: Segment;
  itemCode: string;
  itemName: string;
  category: string;
  sales: number;
  cost: number;
  grossProfit: number;
  grossMarginRate: number;
  marginRate: number;
  monthCount: number;
  /** 'missing_cost': 매출>0 + 원가=0 + 마진≥90% / 'negative_cost': 원가<0 (환입·조정) */
  anomalyType: "missing_cost" | "negative_cost";
  /** 회계팀 검토 의심 사유 (한국어 설명) */
  reason: string;
}

export interface PortfolioMatrixResult {
  matrices: Record<Segment, SegmentMatrix>;
  overallSummary: {
    totalSales: number;
    totalProfit: number;
    weightedMarginRate: number;
    arithmeticMarginRate: number;
    arithmeticMarginExOutlier: number; // outlier 제외 산술 평균
    outlierCount: number;              // 전체 |마진|>100% 품목 수
    missingCostCount: number;          // 원가 미계상 품목 수 (마진 90%+ + 원가 0)
    negativeCostCount: number;         // 음수 원가 품목 수 (환입/조정 누적, 차트에서는 제외됨)
    excludedNegativeCostItems: number; // 음수 원가로 분석에서 제외된 품목 수
    excludedZeroSales: number;   // 제외된 0 매출 행 수
    excludedReturns: number;     // 제외된 반품 행 수
    insufficientDataItems: number; // 거래월 6개 미만 (Dynamic 미적용)
  };
  /** P1-1: 회계팀 검증용 anomaly 통합 리스트 (missing_cost + negative_cost) */
  anomalies: AnomalyExportEntry[];
}

/** Outlier 임계 — 산술 평균 계산 시 |마진| > 이 값 인 품목 제외 */
export const OUTLIER_MARGIN_THRESHOLD = 100;

export interface PortfolioMatrixOptions {
  /** X축 (매출) 임계 모드 */
  salesThresholdMode?: "median" | "p75" | "weighted_avg" | number;
  /** Y축 (마진) 임계 모드 */
  marginThresholdMode?: "median" | "weighted_avg" | "zero" | number;
  /** Dynamic BCG 활성화 (default: true) */
  enableDynamic?: boolean;
  /** Dynamic 화살표 최소 거래월 (default: 6) */
  dynamicMinMonths?: number;
  /** Pareto 80/20 활성화 (default: true) */
  enablePareto?: boolean;
}

// ─── Constants ───────────────────────────────────────────

const ALL_SEGMENTS: Segment[] = ["내수×제품", "내수×상품", "해외×제품", "해외×상품"];
const DEFAULT_DYNAMIC_MIN_MONTHS = 6;

// ─── Public API ──────────────────────────────────────────

/**
 * 매출유형 → 내수/해외/제외 분류.
 *
 * 보완 5: "기타" 매출유형 처리:
 *   - 일반매출, 일반매출(주유소), 일반매출(품목라인X), 자동매출 → 내수
 *   - 해외매출 → 해외
 *   - 반품매출 → 제외 (음수 매출)
 *   - 빈값 → 내수 (default)
 */
export function classifySegmentType(매출유형: string): "내수" | "해외" | "제외" {
  const t = (매출유형 || "").trim();
  if (t.includes("해외")) return "해외";
  if (t.includes("반품")) return "제외";
  // 일반매출, 일반매출(주유소), 일반매출(품목라인X), 자동매출, (빈값) → 내수
  return "내수";
}

/**
 * 사분면 분류 (X: 매출, Y: 마진율).
 *
 * Star: 대매출 + 고마진 (성장 핵심 — 투자 강화)
 * Cash Cow: 대매출 + 저마진 (캐시 발생원 — 마진 개선 또는 유지)
 * Question Mark: 소매출 + 고마진 (잠재 Star — 선별 투자)
 * Dog: 소매출 + 저마진 (정리 후보 — 단가 인상 또는 정리)
 */
export function classifyQuadrant(
  sales: number,
  marginRate: number,
  salesThreshold: number,
  marginThreshold: number,
): Quadrant {
  const highSales = sales >= salesThreshold;
  const highMargin = marginRate >= marginThreshold;

  if (highSales && highMargin) return "star";
  if (highSales && !highMargin) return "cash_cow";
  if (!highSales && highMargin) return "problem_child";
  return "dog";
}

/**
 * 메인 함수 — 4-way BCG 매트릭스 + Dynamic + Pareto + 가중 마진.
 */
export function calcPortfolioMatrix(
  data: CustomerItemDetailRecord[],
  options: PortfolioMatrixOptions = {},
): PortfolioMatrixResult {
  const {
    salesThresholdMode = "median",
    marginThresholdMode = "median",
    enableDynamic = true,
    dynamicMinMonths = DEFAULT_DYNAMIC_MIN_MONTHS,
    enablePareto = true,
  } = options;

  // 0. 사전 필터 + 통계
  let excludedZeroSales = 0;
  let excludedReturns = 0;

  // 1. 품목별 집계 (segment × itemCode)
  type ItemAgg = {
    itemCode: string;
    itemName: string;
    category: string;
    segment: Segment;
    totalCost: number;
    monthlyData: Map<string, { sales: number; profit: number }>;
  };
  const itemMap = new Map<string, ItemAgg>(); // key = `${segment}|${itemCode}`

  for (const rec of data) {
    // 필터: 계정구분 ∈ {제품, 상품}
    const acct = (rec.계정구분 || "").trim();
    if (acct !== "제품" && acct !== "상품") continue;

    // 필터: 매출유형 분류
    const segType = classifySegmentType(rec.매출유형 || "");
    if (segType === "제외") {
      excludedReturns++;
      continue;
    }

    const sales = rec.매출액?.실적 || 0;
    const profit = rec.영업이익?.실적 || 0;
    const cost = rec.실적매출원가?.실적 || 0;

    // 0 매출 또는 음수 제외
    if (sales <= 0) {
      excludedZeroSales++;
      continue;
    }

    const segment = `${segType}×${acct}` as Segment;
    const itemCode = (rec.품목 || "").trim();
    if (!itemCode) continue;
    const itemName = (rec.품목명 || itemCode).trim();
    const category = (rec.제품군 || "").trim();
    const month = (rec.매출연월 || rec.month || "").trim();

    const key = `${segment}|${itemCode}`;
    let agg = itemMap.get(key);
    if (!agg) {
      agg = {
        itemCode, itemName, category, segment,
        totalCost: 0,
        monthlyData: new Map(),
      };
      itemMap.set(key, agg);
    }
    agg.totalCost += cost;

    if (month) {
      const m = agg.monthlyData.get(month) || { sales: 0, profit: 0 };
      m.sales += sales;
      m.profit += profit;
      agg.monthlyData.set(month, m);
    } else {
      // 매출연월 없는 경우 — "_unknown" 키로 합산 (Dynamic 불가)
      const m = agg.monthlyData.get("_unknown") || { sales: 0, profit: 0 };
      m.sales += sales;
      m.profit += profit;
      agg.monthlyData.set("_unknown", m);
    }
  }

  // 2. segment별 entries 생성
  const matrices = {} as Record<Segment, SegmentMatrix>;
  let insufficientDataItems = 0;
  let excludedNegativeCostItems = 0;
  // P1-1: 회계팀 검증용 anomaly 통합 수집 (entries에서 제외되는 음수 원가도 포함)
  const anomalies: AnomalyExportEntry[] = [];

  for (const segment of ALL_SEGMENTS) {
    const segEntries: BCGMatrixEntry[] = [];

    for (const agg of Array.from(itemMap.values())) {
      if (agg.segment !== segment) continue;

      // 12M 통합 매출/이익
      let sales = 0;
      let profit = 0;
      const monthList: string[] = [];
      for (const [m, v] of Array.from(agg.monthlyData.entries())) {
        sales += v.sales;
        profit += v.profit;
        if (m !== "_unknown") monthList.push(m);
      }
      const marginRate = safeDivide(profit, sales) * 100;
      const monthCount = monthList.length;

      // Dynamic BCG (거래월 6개+ 시만)
      let trendDirection: TrendDirection = "insufficient_data";
      let prevSales: number | undefined;
      let prevProfit: number | undefined;
      let prevMargin: number | undefined;
      let currSales: number | undefined;
      let currProfit: number | undefined;
      let currMargin: number | undefined;

      if (enableDynamic && monthCount >= dynamicMinMonths) {
        const sortedMonths = monthList.sort();
        const half = Math.floor(sortedMonths.length / 2);
        const prevMonths = sortedMonths.slice(0, half);
        const currMonths = sortedMonths.slice(half);

        prevSales = 0; prevProfit = 0;
        for (const m of prevMonths) {
          const v = agg.monthlyData.get(m)!;
          prevSales += v.sales;
          prevProfit += v.profit;
        }
        currSales = 0; currProfit = 0;
        for (const m of currMonths) {
          const v = agg.monthlyData.get(m)!;
          currSales += v.sales;
          currProfit += v.profit;
        }
        prevMargin = safeDivide(prevProfit, prevSales) * 100;
        currMargin = safeDivide(currProfit, currSales) * 100;

        // 추세 방향
        const salesDelta = currSales - prevSales;
        const marginDelta = currMargin - prevMargin;
        const salesPctChange = safeDivide(salesDelta, prevSales);
        if (Math.abs(salesPctChange) < 0.1 && Math.abs(marginDelta) < 1) {
          trendDirection = "stable";
        } else if (salesDelta > 0 && marginDelta > 0) {
          trendDirection = "improving";
        } else if (salesDelta < 0 && marginDelta < 0) {
          trendDirection = "declining";
        } else {
          // 매출/마진 방향 상반 — stable로 분류
          trendDirection = "stable";
        }
      } else {
        insufficientDataItems++;
        if (monthCount === 0) {
          trendDirection = "new";
        }
      }

      // 회계 미계상 의심: 매출>0, 원가=0, 마진율 90%+ (실측 4건 모두 해당)
      const hasMissingCost = agg.totalCost === 0 && sales > 0 && marginRate >= 90;
      // 음수 원가 (회계 분개 누적) — 환입/조정으로 net 음수 → 매출총이익율 >100%
      const hasNegativeCost = agg.totalCost < 0;

      // 음수 원가는 회계 데이터 이상 (수학적으로는 a - (-b) = a + b 정확하나
      // 비즈니스 결과 비현실적: 매출 < 영업이익 발생). 차트에서 제외하고 통계만 카운트.
      if (hasNegativeCost) {
        excludedNegativeCostItems++;
        // P1-1: anomaly export 수집 (entries 진입 차단되지만 회계팀 검증 자료로 보존)
        const ngGrossProfit = sales - agg.totalCost; // 매출 - (-원가) = 매출 + |원가|
        const ngGrossMarginRate = safeDivide(ngGrossProfit, sales) * 100;
        anomalies.push({
          segment, itemCode: agg.itemCode, itemName: agg.itemName, category: agg.category,
          sales, cost: agg.totalCost, grossProfit: ngGrossProfit, grossMarginRate: ngGrossMarginRate,
          marginRate, monthCount, anomalyType: "negative_cost",
          reason: `매출원가 음수 (${agg.totalCost.toLocaleString("ko-KR")}원) — 환입·조정 분개 누적 결과 출고 원가 초과. 매출총이익율 ${ngGrossMarginRate.toFixed(1)}%로 100% 초과 (비현실적). 회계팀 분개 검토 필요.`,
        });
        continue; // 차트 entries에 추가 안 함
      }

      // 매출총이익 계산 (= 매출 - 매출원가). 원가 음수 시 매출총이익 > 매출 가능 (이미 제외됨)
      const grossProfit = sales - agg.totalCost;
      const grossMarginRate = safeDivide(grossProfit, sales) * 100;

      // P1-1: 원가 미계상 의심 anomaly 수집 (entries에는 포함되지만 회계팀 검증 자료로도 export)
      if (hasMissingCost) {
        anomalies.push({
          segment, itemCode: agg.itemCode, itemName: agg.itemName, category: agg.category,
          sales, cost: agg.totalCost, grossProfit, grossMarginRate,
          marginRate, monthCount, anomalyType: "missing_cost",
          reason: `매출원가 0원 + 영업이익율 ${marginRate.toFixed(1)}% (90% 초과) — 회계 ERP 매출원가 미계상 의심. SAP 원가 계산 미실행 또는 BOM 누락 가능성. 회계팀 확인 필요.`,
        });
      }

      segEntries.push({
        segment, itemCode: agg.itemCode, itemName: agg.itemName, category: agg.category,
        sales, operatingProfit: profit, marginRate, cost: agg.totalCost,
        grossProfit, grossMarginRate,
        quadrant: "dog", // 임시 — 임계 산출 후 재분류
        isPareto80: false,
        hasMissingCost,
        hasNegativeCost,
        monthCount,
        prevSales, prevProfit, prevMargin, currSales, currProfit, currMargin,
        trendDirection,
      });
    }

    // 3. 임계 산출
    const totalSales = segEntries.reduce((s, e) => s + e.sales, 0);
    const totalProfit = segEntries.reduce((s, e) => s + e.operatingProfit, 0);
    const weightedMarginRate = safeDivide(totalProfit, totalSales) * 100;
    const arithmeticMarginRate = segEntries.length > 0
      ? segEntries.reduce((s, e) => s + e.marginRate, 0) / segEntries.length
      : 0;
    // outlier 제외 산술 평균 (|마진|≤100%)
    const nonOutliers = segEntries.filter(e => Math.abs(e.marginRate) <= OUTLIER_MARGIN_THRESHOLD);
    const arithmeticMarginExOutlier = nonOutliers.length > 0
      ? nonOutliers.reduce((s, e) => s + e.marginRate, 0) / nonOutliers.length
      : 0;
    const outlierCount = segEntries.length - nonOutliers.length;

    const salesThreshold = computeSalesThreshold(segEntries, salesThresholdMode, weightedMarginRate);
    const marginThreshold = computeMarginThreshold(segEntries, marginThresholdMode, weightedMarginRate);
    const sortedSales = segEntries.map(e => e.sales).sort((a, b) => a - b);
    const salesP75 = sortedSales.length > 0 ? sortedSales[Math.floor(sortedSales.length * 0.75)] : 0;

    // 4. 사분면 분류
    for (const entry of segEntries) {
      entry.quadrant = classifyQuadrant(entry.sales, entry.marginRate, salesThreshold, marginThreshold);
    }

    // 5. Pareto 80/20 마킹
    if (enablePareto && totalSales > 0) {
      const sortedByRevenue = [...segEntries].sort((a, b) => b.sales - a.sales);
      let cumulative = 0;
      for (const entry of sortedByRevenue) {
        cumulative += entry.sales;
        entry.isPareto80 = cumulative <= totalSales * 0.8;
      }
    }

    // 6. 사분면별 통계
    const quadrantStats: Record<Quadrant, QuadrantStats> = {
      star: { count: 0, sales: 0, profit: 0, salesShare: 0 },
      cash_cow: { count: 0, sales: 0, profit: 0, salesShare: 0 },
      problem_child: { count: 0, sales: 0, profit: 0, salesShare: 0 },
      dog: { count: 0, sales: 0, profit: 0, salesShare: 0 },
    };
    for (const e of segEntries) {
      const q = quadrantStats[e.quadrant];
      q.count++;
      q.sales += e.sales;
      q.profit += e.operatingProfit;
    }
    for (const q of Object.values(quadrantStats)) {
      q.salesShare = safeDivide(q.sales, totalSales);
    }

    matrices[segment] = {
      segment,
      entries: segEntries,
      totalSales, totalProfit,
      weightedMarginRate, arithmeticMarginRate,
      arithmeticMarginExOutlier, outlierCount,
      quadrantStats,
      thresholds: { salesThreshold, marginThreshold, salesP75 },
    };
  }

  // 7. 전체 요약 (outlier 제외 산술도 포함)
  let overallSales = 0;
  let overallProfit = 0;
  let overallArithmeticSum = 0;
  let overallEntryCount = 0;
  let overallExOutlierSum = 0;
  let overallExOutlierCount = 0;
  let overallOutlierCount = 0;
  let overallMissingCost = 0;
  let overallNegativeCost = 0;
  for (const m of Object.values(matrices)) {
    overallSales += m.totalSales;
    overallProfit += m.totalProfit;
    for (const e of m.entries) {
      overallArithmeticSum += e.marginRate;
      overallEntryCount++;
      if (Math.abs(e.marginRate) <= OUTLIER_MARGIN_THRESHOLD) {
        overallExOutlierSum += e.marginRate;
        overallExOutlierCount++;
      } else {
        overallOutlierCount++;
      }
      if (e.hasMissingCost) overallMissingCost++;
      if (e.hasNegativeCost) overallNegativeCost++;
    }
  }

  return {
    matrices,
    overallSummary: {
      totalSales: overallSales,
      totalProfit: overallProfit,
      weightedMarginRate: safeDivide(overallProfit, overallSales) * 100,
      arithmeticMarginRate: overallEntryCount > 0 ? overallArithmeticSum / overallEntryCount : 0,
      arithmeticMarginExOutlier: overallExOutlierCount > 0 ? overallExOutlierSum / overallExOutlierCount : 0,
      outlierCount: overallOutlierCount,
      missingCostCount: overallMissingCost,
      negativeCostCount: overallNegativeCost,
      excludedNegativeCostItems,
      excludedZeroSales,
      excludedReturns,
      insufficientDataItems,
    },
    anomalies,
  };
}

// ─── Helpers ─────────────────────────────────────────────

function computeSalesThreshold(
  entries: BCGMatrixEntry[],
  mode: PortfolioMatrixOptions["salesThresholdMode"],
  weightedMargin: number,
): number {
  if (typeof mode === "number") return mode;
  if (entries.length === 0) return 0;
  const sortedSales = entries.map(e => e.sales).sort((a, b) => a - b);
  if (mode === "median") return sortedSales[Math.floor(sortedSales.length / 2)];
  if (mode === "p75") return sortedSales[Math.floor(sortedSales.length * 0.75)];
  if (mode === "weighted_avg") {
    const totalSales = entries.reduce((s, e) => s + e.sales, 0);
    return totalSales / entries.length; // 단순 평균 매출 (참고용)
  }
  void weightedMargin; // unused for sales threshold
  return sortedSales[Math.floor(sortedSales.length / 2)];
}

function computeMarginThreshold(
  entries: BCGMatrixEntry[],
  mode: PortfolioMatrixOptions["marginThresholdMode"],
  weightedMargin: number,
): number {
  if (typeof mode === "number") return mode;
  if (mode === "zero") return 0;
  if (mode === "weighted_avg") return weightedMargin;
  if (mode === "median") {
    if (entries.length === 0) return 0;
    const sortedMargins = entries.map(e => e.marginRate).sort((a, b) => a - b);
    return sortedMargins[Math.floor(sortedMargins.length / 2)];
  }
  // default: median
  if (entries.length === 0) return 0;
  const sortedMargins = entries.map(e => e.marginRate).sort((a, b) => a - b);
  return sortedMargins[Math.floor(sortedMargins.length / 2)];
}

/**
 * 사분면 한글 이름 (UI 표시용)
 */
export function getQuadrantKoreanName(q: Quadrant): string {
  switch (q) {
    case "star": return "스타 ⭐";
    case "cash_cow": return "캐시카우 🐄";
    case "problem_child": return "문제아동 ❓";
    case "dog": return "낙오자 🐕";
  }
}

/**
 * 사분면 권장 액션 (NLG 입력)
 */
export function getQuadrantAction(q: Quadrant): string {
  switch (q) {
    case "star": return "투자 강화 — 시장 점유 확대";
    case "cash_cow": return "마진 개선 (단가 인상) 또는 현재 유지";
    case "problem_child": return "선별 투자 — 매출 확대 추진";
    case "dog": return "단가 인상 또는 거래 정리 검토";
  }
}
