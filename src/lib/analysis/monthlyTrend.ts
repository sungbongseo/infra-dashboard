import type { PlanActualDiff } from "@/types";

// ─── 타입 ────────────────────────────────────────────────────────────

export interface MonthlyTrendPoint {
  month: string;         // YYYYMM
  monthLabel: string;    // "25.01" (표시용)
  매출액: number;
  실적매출원가: number;
  매출총이익: number;
  영업이익: number;
  매출총이익율: number;   // %
  영업이익율: number;     // %
}

export interface MoMGrowth {
  month: string;
  매출액증감: number;     // 전월 대비 증감액
  매출액증감율: number;   // 전월 대비 %
  영업이익증감: number;
  영업이익증감율: number;
}

export interface TrendChangeAlert {
  month: string;
  metric: string;
  direction: "up" | "down";
  magnitude: number;    // % 변화
  message: string;
}

// ─── 유틸 ────────────────────────────────────────────────────────────

/** YYYYMM → "25.01" */
function toMonthLabel(month: string): string {
  if (month.length !== 6) return month;
  return `${month.substring(2, 4)}.${month.substring(4, 6)}`;
}

/** 안전한 비율 계산 */
function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const rate = (numerator / denominator) * 100;
  return isFinite(rate) ? rate : 0;
}

/** 안전한 증감율 계산 */
function safeGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  const rate = ((current - previous) / Math.abs(previous)) * 100;
  return isFinite(rate) ? rate : 0;
}

// ─── 월별 트렌드 집계 ────────────────────────────────────────────────

/**
 * P&L 데이터를 월별로 집계.
 * PlanActualDiff 구조 데이터에서 실적(actual) 값을 합산하여 월별 포인트 생성.
 *
 * @param data month 필드가 있는 P&L 레코드 배열
 * @param config 필드명과 값 추출 방식 지정
 */
export function calcMonthlyTrend<T extends Record<string, any>>(
  data: T[],
  config: {
    salesField: string;       // "매출액"
    costField: string;        // "실적매출원가"
    grossField: string;       // "매출총이익"
    opField: string;          // "영업이익"
    valueAccessor: (field: any) => number;  // (pad) => pad.실적
  }
): MonthlyTrendPoint[] {
  const { salesField, costField, grossField, opField, valueAccessor } = config;

  // month별 합산
  const map = new Map<string, { sales: number; cost: number; gross: number; op: number }>();

  for (const row of data) {
    const m = row.month;
    if (!m) continue;

    const sales = valueAccessor(row[salesField]) || 0;
    const cost = valueAccessor(row[costField]) || 0;
    const gross = valueAccessor(row[grossField]) || 0;
    const op = valueAccessor(row[opField]) || 0;

    const existing = map.get(m);
    if (existing) {
      existing.sales += sales;
      existing.cost += cost;
      existing.gross += gross;
      existing.op += op;
    } else {
      map.set(m, { sales, cost, gross, op });
    }
  }

  // 정렬 후 결과 생성
  const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return sorted.map(([month, agg]) => ({
    month,
    monthLabel: toMonthLabel(month),
    매출액: agg.sales,
    실적매출원가: agg.cost,
    매출총이익: agg.gross,
    영업이익: agg.op,
    매출총이익율: safeRate(agg.gross, agg.sales),
    영업이익율: safeRate(agg.op, agg.sales),
  }));
}

// ─── 전월 대비 성장률 ────────────────────────────────────────────────

/**
 * 전월 대비(MoM) 성장률 계산.
 * trend 배열은 이미 월 오름차순 정렬되어 있어야 함.
 */
export function calcMoMGrowth(trend: MonthlyTrendPoint[]): MoMGrowth[] {
  if (trend.length < 2) return [];

  const result: MoMGrowth[] = [];

  for (let i = 1; i < trend.length; i++) {
    const curr = trend[i];
    const prev = trend[i - 1];

    result.push({
      month: curr.month,
      매출액증감: curr.매출액 - prev.매출액,
      매출액증감율: safeGrowthRate(curr.매출액, prev.매출액),
      영업이익증감: curr.영업이익 - prev.영업이익,
      영업이익증감율: safeGrowthRate(curr.영업이익, prev.영업이익),
    });
  }

  return result;
}

// ─── 추세 변화 감지 ──────────────────────────────────────────────────

/**
 * 3개월 이동평균(MA3) 대비 ±20% 이상 변화 시 알림 생성.
 * 매출액과 영업이익 두 지표에 대해 감지.
 */
export function detectTrendChange(
  trend: MonthlyTrendPoint[],
  threshold = 0.2
): TrendChangeAlert[] {
  if (trend.length < 4) return []; // MA3 계산에 최소 3개월 + 비교 1개월

  const alerts: TrendChangeAlert[] = [];
  const metrics: { key: keyof MonthlyTrendPoint; label: string }[] = [
    { key: "매출액", label: "매출액" },
    { key: "영업이익", label: "영업이익" },
  ];

  for (const { key, label } of metrics) {
    for (let i = 3; i < trend.length; i++) {
      // MA3 = 이전 3개월 평균
      const ma3 =
        ((trend[i - 3][key] as number) +
          (trend[i - 2][key] as number) +
          (trend[i - 1][key] as number)) /
        3;

      if (ma3 === 0) continue;

      const current = trend[i][key] as number;
      const deviation = (current - ma3) / Math.abs(ma3);

      if (!isFinite(deviation)) continue;

      if (Math.abs(deviation) >= threshold) {
        const direction: "up" | "down" = deviation > 0 ? "up" : "down";
        const magnitude = Math.round(deviation * 100);
        const dirLabel = direction === "up" ? "상승" : "하락";

        alerts.push({
          month: trend[i].month,
          metric: label,
          direction,
          magnitude,
          message: `${toMonthLabel(trend[i].month)} ${label} 3개월 이동평균 대비 ${Math.abs(magnitude)}% ${dirLabel}`,
        });
      }
    }
  }

  return alerts;
}

// ─── PlanActualDiff 편의 accessor ────────────────────────────────────

/** PlanActualDiff에서 실적(actual) 값 추출 */
export const padActual = (pad: PlanActualDiff | number | undefined): number => {
  if (pad == null) return 0;
  if (typeof pad === "number") return pad;
  return pad.실적 ?? 0;
};

/** PlanActualDiff에서 계획(plan) 값 추출 */
export const padPlan = (pad: PlanActualDiff | number | undefined): number => {
  if (pad == null) return 0;
  if (typeof pad === "number") return pad;
  return pad.계획 ?? 0;
};
