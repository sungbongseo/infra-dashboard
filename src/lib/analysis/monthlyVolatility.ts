/**
 * 월별 변동성 분석 (Coefficient of Variation) — BCG v4 P2-3
 *
 * 품목별 월간 매출의 표준편차/평균 비율 (CV) 계산:
 * - CV = stdev(월별 매출) / mean(월별 매출)
 * - CV < 0.3: 안정적 (변동 작음)
 * - CV 0.3~0.5: 보통
 * - CV > 0.5: 변동 큼 (계절성/주문 분산 의심)
 *
 * Volatility Quadrant 분류 (Bain volatility quadrant 패턴):
 * - 평균 매출 × CV로 4분면:
 *   안정 + 큰매출 = 핵심 (Stable Cash Cow)
 *   변동 + 큰매출 = 위험 (Volatile Big — 단발성 주문 의심)
 *   안정 + 작은매출 = 정기 (Stable Small)
 *   변동 + 작은매출 = 일회성 (One-shot)
 *
 * 8 원칙 적용:
 * - 원칙 1: 거래월 부족 (<3) 시 'insufficient_data' 별도 분류
 * - 원칙 4: edge case별 단위 테스트
 *
 * @phaseB v4 P2-3
 */

import type { CustomerItemDetailRecord } from "@/types";
import type { Segment } from "./productPortfolioMatrix";
import { classifySegmentType } from "./productPortfolioMatrix";
import { safeDivide } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

export type VolatilityLevel = "stable" | "moderate" | "volatile" | "insufficient_data";
export type VolatilityQuadrant = "stable_cash_cow" | "volatile_big" | "stable_small" | "one_shot" | "insufficient_data";

export interface VolatilityEntry {
  itemCode: string;
  itemName: string;
  segment: Segment;
  monthCount: number;
  /** 월별 매출 평균 */
  meanSales: number;
  /** 월별 매출 표준편차 (모집단 stdev, ddof=0) */
  stdevSales: number;
  /** CV = stdev / mean (mean이 0이면 0) */
  cv: number;
  level: VolatilityLevel;
  quadrant: VolatilityQuadrant;
  /** 12M 누적 매출 (참고) */
  totalSales: number;
}

export interface VolatilityResult {
  entries: VolatilityEntry[];
  /** 임계값 (median 기반) */
  thresholds: {
    salesThreshold: number;   // 평균 매출 median
    cvThreshold: number;      // CV median
  };
  /** 사분면 통계 */
  quadrantStats: Record<VolatilityQuadrant, { count: number; totalSales: number }>;
  /** 거래월 3개 미만 (CV 산출 불가) 카운트 */
  insufficientDataItems: number;
  /** 변동 큰 큰매출 품목 (volatile_big) — 위험 신호 */
  highRiskItems: VolatilityEntry[];
}

const MIN_MONTHS_FOR_CV = 3;
const VOLATILITY_LOW = 0.3;
const VOLATILITY_HIGH = 0.5;

// ─── Public API ──────────────────────────────────────────

/**
 * CV 임계 분류:
 * < 0.3: stable / 0.3~0.5: moderate / > 0.5: volatile
 */
export function classifyVolatilityLevel(cv: number, monthCount: number): VolatilityLevel {
  if (monthCount < MIN_MONTHS_FOR_CV) return "insufficient_data";
  if (cv < VOLATILITY_LOW) return "stable";
  if (cv > VOLATILITY_HIGH) return "volatile";
  return "moderate";
}

/**
 * Volatility Quadrant 분류 (mean × cv):
 * - stable + big sales = stable_cash_cow (효자)
 * - volatile + big sales = volatile_big (위험)
 * - stable + small sales = stable_small (정기)
 * - volatile + small sales = one_shot (일회성)
 */
export function classifyVolatilityQuadrant(
  meanSales: number,
  cv: number,
  salesThreshold: number,
  cvThreshold: number,
  monthCount: number,
): VolatilityQuadrant {
  if (monthCount < MIN_MONTHS_FOR_CV) return "insufficient_data";
  const isBig = meanSales >= salesThreshold;
  const isVolatile = cv >= cvThreshold;
  if (isBig && !isVolatile) return "stable_cash_cow";
  if (isBig && isVolatile) return "volatile_big";
  if (!isBig && !isVolatile) return "stable_small";
  return "one_shot";
}

/**
 * 메인 함수 — 품목별 월간 변동성 + Volatility Quadrant 분류
 */
export function calcMonthlyVolatility(
  data: CustomerItemDetailRecord[],
): VolatilityResult {
  // 품목별 월간 매출 집계 (key=segment+itemCode)
  type Agg = {
    itemCode: string;
    itemName: string;
    segment: Segment;
    monthlyMap: Map<string, number>; // month → sales
  };
  const itemMap = new Map<string, Agg>();

  for (const r of data) {
    const acct = (r.계정구분 || "").trim();
    if (acct !== "제품" && acct !== "상품") continue;
    const segType = classifySegmentType(r.매출유형 || "");
    if (segType === "제외") continue;
    const sales = r.매출액?.실적 || 0;
    if (sales <= 0) continue;
    const itemCode = (r.품목 || "").trim();
    if (!itemCode) continue;
    const month = (r.매출연월 || r.month || "").trim();
    if (!month) continue;

    const segment = `${segType}×${acct}` as Segment;
    const key = `${segment}|${itemCode}`;
    let agg = itemMap.get(key);
    if (!agg) {
      agg = {
        itemCode, itemName: (r.품목명 || itemCode).trim(),
        segment, monthlyMap: new Map(),
      };
      itemMap.set(key, agg);
    }
    agg.monthlyMap.set(month, (agg.monthlyMap.get(month) || 0) + sales);
  }

  // entries 생성 — CV 계산
  const rawEntries: Array<Omit<VolatilityEntry, "quadrant">> = [];
  let insufficientDataItems = 0;
  for (const agg of Array.from(itemMap.values())) {
    const months = Array.from(agg.monthlyMap.entries()).map(([m, s]) => ({ m, s }));
    const monthCount = months.length;
    const totalSales = months.reduce((sum, x) => sum + x.s, 0);
    const meanSales = monthCount > 0 ? totalSales / monthCount : 0;

    let cv = 0;
    let stdevSales = 0;
    let level: VolatilityLevel = "insufficient_data";
    if (monthCount >= MIN_MONTHS_FOR_CV) {
      // 모집단 표준편차 (ddof=0) — 12 months의 12개 데이터로 충분
      const variance = months.reduce((s, x) => s + (x.s - meanSales) ** 2, 0) / monthCount;
      stdevSales = Math.sqrt(variance);
      cv = safeDivide(stdevSales, meanSales);
      level = classifyVolatilityLevel(cv, monthCount);
    } else {
      insufficientDataItems++;
    }

    rawEntries.push({
      itemCode: agg.itemCode,
      itemName: agg.itemName,
      segment: agg.segment,
      monthCount,
      meanSales,
      stdevSales,
      cv,
      level,
      totalSales,
    });
  }

  // 임계값: median 기반 (insufficient_data 제외)
  const validEntries = rawEntries.filter(e => e.level !== "insufficient_data");
  const sortedSales = validEntries.map(e => e.meanSales).sort((a, b) => a - b);
  const sortedCV = validEntries.map(e => e.cv).sort((a, b) => a - b);
  const salesThreshold = sortedSales.length > 0 ? sortedSales[Math.floor(sortedSales.length / 2)] : 0;
  const cvThreshold = sortedCV.length > 0 ? sortedCV[Math.floor(sortedCV.length / 2)] : VOLATILITY_LOW;

  // 사분면 분류
  const entries: VolatilityEntry[] = rawEntries.map(e => ({
    ...e,
    quadrant: classifyVolatilityQuadrant(e.meanSales, e.cv, salesThreshold, cvThreshold, e.monthCount),
  }));

  // 사분면 통계
  const quadrantStats: Record<VolatilityQuadrant, { count: number; totalSales: number }> = {
    stable_cash_cow: { count: 0, totalSales: 0 },
    volatile_big: { count: 0, totalSales: 0 },
    stable_small: { count: 0, totalSales: 0 },
    one_shot: { count: 0, totalSales: 0 },
    insufficient_data: { count: 0, totalSales: 0 },
  };
  for (const e of entries) {
    quadrantStats[e.quadrant].count++;
    quadrantStats[e.quadrant].totalSales += e.totalSales;
  }

  // 위험 품목 (volatile_big — 큰 매출인데 변동 큼)
  const highRiskItems = entries
    .filter(e => e.quadrant === "volatile_big")
    .sort((a, b) => b.totalSales - a.totalSales);

  return {
    entries,
    thresholds: { salesThreshold, cvThreshold },
    quadrantStats,
    insufficientDataItems,
    highRiskItems,
  };
}

/**
 * UI 표시용 — Volatility Quadrant 한국어 라벨
 */
export function getVolatilityQuadrantLabel(q: VolatilityQuadrant): string {
  switch (q) {
    case "stable_cash_cow": return "🟢 안정 + 큰매출 (효자)";
    case "volatile_big": return "🟡 변동 + 큰매출 (위험)";
    case "stable_small": return "🔵 안정 + 작은매출 (정기)";
    case "one_shot": return "🔴 변동 + 작은매출 (일회성)";
    case "insufficient_data": return "⚪ 거래월 부족";
  }
}
