/** 미수금 분석 임계값 설정 (향후 사용자 설정 UI 연동 가능) */
export const RECEIVABLE_THRESHOLDS = {
  dso: {
    excellent: 30,
    good: 45,
    fair: 60,
    poor: 90,
  },
  credit: {
    danger: 100,
    warning: 80,
    caution: 60,
  },
  overdue: {
    critical: 50, // %
    warning: 30,
  },
  longTerm: {
    warning: 20, // %
  },
  badDebt: {
    standard: { month4: 0.01, month5: 0.05, month6: 0.10, overdue: 0.50 },
    conservative: { month4: 0.05, month5: 0.10, month6: 0.30, overdue: 0.80 },
  },
} as const;

export type BadDebtProfile = keyof typeof RECEIVABLE_THRESHOLDS.badDebt;

/** DSO 등급 판정 */
export function classifyDSO(dso: number): "excellent" | "good" | "fair" | "poor" {
  if (dso <= RECEIVABLE_THRESHOLDS.dso.excellent) return "excellent";
  if (dso <= RECEIVABLE_THRESHOLDS.dso.good) return "good";
  if (dso <= RECEIVABLE_THRESHOLDS.dso.fair) return "fair";
  return "poor";
}

/** 여신사용률 등급 판정 */
export function classifyCredit(utilizationRate: number): "danger" | "warning" | "caution" | "normal" {
  if (utilizationRate >= RECEIVABLE_THRESHOLDS.credit.danger) return "danger";
  if (utilizationRate >= RECEIVABLE_THRESHOLDS.credit.warning) return "warning";
  if (utilizationRate >= RECEIVABLE_THRESHOLDS.credit.caution) return "caution";
  return "normal";
}

/** 대손충당금 추정 (aging 버킷별 적용률) */
export function estimateBadDebtProvision(
  agingBuckets: { month4: number; month5: number; month6: number; overdue: number },
  profile: BadDebtProfile = "standard",
): number {
  const rates = RECEIVABLE_THRESHOLDS.badDebt[profile];
  return (
    agingBuckets.month4 * rates.month4 +
    agingBuckets.month5 * rates.month5 +
    agingBuckets.month6 * rates.month6 +
    agingBuckets.overdue * rates.overdue
  );
}
