import type { OverviewKpis } from "./kpi";

export type InsightSeverity = "positive" | "neutral" | "warning" | "critical";

export interface Insight {
  id: string;
  title: string;
  message: string;
  severity: InsightSeverity;
  category: "매출" | "수금" | "수익성" | "수주" | "미수금";
  metric?: string;
  value?: number;
}

export interface InsightConfig {
  kpis: OverviewKpis;
  netCollectionRate?: number;
  dso?: number;
  ccc?: number;
  forecastAccuracy?: number;
  contributionMarginRate?: number;
  grossProfitMargin?: number;
  operatingLeverage?: number;
  collectionEfficiency?: number;
  salesTrend?: "up" | "down" | "flat";
  avgGrowthRate?: number;
  costOfGoodsRatio?: number;
  materialCostRatio?: number;
  outsourcingRatio?: number;
}

// ─── 선언적 규칙 엔진 ──────────────────────────────────────────────

interface AlertRule {
  id: string;
  title: string;
  category: Insight["category"];
  metric?: string;
  /** 값 추출기 - config에서 평가할 숫자를 반환. undefined이면 규칙 스킵 */
  getValue: (c: InsightConfig) => number | undefined;
  /** 임계값 기반 조건 배열 (위→아래 순서로 첫 매칭 사용) */
  conditions: {
    test: (v: number) => boolean;
    severity: InsightSeverity;
    titleSuffix: string;
    message: (v: number, c: InsightConfig) => string;
  }[];
}

const safe = (v: number | undefined) => (v !== undefined && isFinite(v) ? v : undefined);

const RULES: AlertRule[] = [
  // Rule 1: 순수 수금율
  {
    id: "col",
    title: "순수 수금율",
    category: "수금",
    metric: "netCollectionRate",
    getValue: (c) => safe(c.netCollectionRate ?? c.kpis.collectionRate),
    conditions: [
      { test: (v) => v >= 95, severity: "positive", titleSuffix: "우수", message: (v) => `순수 수금율 ${v.toFixed(1)}%로 매우 양호합니다 (선수금 제외 기준).` },
      { test: (v) => v < 70, severity: "critical", titleSuffix: "저조 경고", message: (v) => `순수 수금율 ${v.toFixed(1)}%로 목표(70%) 미달입니다 (선수금 제외 기준). 연체 거래처 집중 관리가 필요합니다.` },
      { test: (v) => v < 85, severity: "warning", titleSuffix: "주의", message: (v) => `순수 수금율 ${v.toFixed(1)}%로 개선이 필요합니다 (선수금 제외 기준).` },
    ],
  },
  // Rule 2: 영업이익율
  {
    id: "op",
    title: "영업이익율",
    category: "수익성",
    metric: "operatingProfitRate",
    getValue: (c) => safe(c.kpis.operatingProfitRate),
    conditions: [
      { test: (v) => v < 0, severity: "critical", titleSuffix: "적자 발생", message: (v) => `영업이익율 ${v.toFixed(1)}%로 적자 상태입니다. 비용 구조 점검이 시급합니다.` },
      { test: (v) => v < 5, severity: "warning", titleSuffix: "저조", message: (v) => `영업이익율 ${v.toFixed(1)}%로 수익성 개선이 필요합니다. 원가절감 또는 고마진 제품 확대를 검토하세요.` },
      { test: (v) => v >= 10, severity: "positive", titleSuffix: "양호", message: (v) => `영업이익율 ${v.toFixed(1)}%로 수익성이 양호합니다.` },
    ],
  },
  // Rule 3: 매출 계획 달성율
  {
    id: "plan",
    title: "매출 계획",
    category: "매출",
    metric: "salesPlanAchievement",
    getValue: (c) => safe(c.kpis.salesPlanAchievement),
    conditions: [
      { test: (v) => v >= 100, severity: "positive", titleSuffix: "초과 달성", message: (v) => `매출계획달성률 ${v.toFixed(1)}%로 목표를 초과 달성했습니다.` },
      { test: (v) => v < 80, severity: "warning", titleSuffix: "미달", message: (v) => `매출계획달성률 ${v.toFixed(1)}%로 목표(80%) 미달입니다. 영업 활동 강화가 필요합니다.` },
    ],
  },
  // Rule 4: DSO (매출채권 회수기간)
  {
    id: "dso",
    title: "DSO",
    category: "미수금",
    metric: "dso",
    getValue: (c) => safe(c.dso),
    conditions: [
      { test: (v) => v > 90, severity: "critical", titleSuffix: "과다", message: (v) => `매출채권 회수기간 ${v.toFixed(0)}일로 매우 길어 현금흐름에 부정적입니다. 채권 회수 속도 개선이 시급합니다.` },
      { test: (v) => v > 60, severity: "warning", titleSuffix: "주의", message: (v) => `매출채권 회수기간 ${v.toFixed(0)}일로 업종 평균(60일) 이상입니다.` },
      { test: (v) => v <= 30, severity: "positive", titleSuffix: "우수", message: (v) => `매출채권 회수기간 ${v.toFixed(0)}일로 현금 회수가 빠릅니다.` },
    ],
  },
  // Rule 5: CCC (현금전환주기)
  {
    id: "ccc",
    title: "현금전환주기",
    category: "수금",
    getValue: (c) => safe(c.ccc),
    conditions: [
      { test: (v) => v < 0, severity: "positive", titleSuffix: "우수", message: (v) => `CCC ${v.toFixed(0)}일로 매입 결제 전에 매출 회수가 이루어지고 있습니다.` },
      { test: (v) => v > 60, severity: "warning", titleSuffix: "주의", message: (v) => `CCC ${v.toFixed(0)}일로 운전자본 부담이 큽니다. DSO 단축과 DPO 연장을 동시에 추진하세요.` },
    ],
  },
  // Rule 6: 예측 정확도
  {
    id: "fc",
    title: "예측 정확도",
    category: "매출",
    getValue: (c) => c.forecastAccuracy,
    conditions: [
      { test: (v) => v < 70, severity: "warning", titleSuffix: "저조", message: (v) => `매출 예측 정확도 ${v.toFixed(1)}%로 계획 수립 프로세스 개선이 필요합니다.` },
      { test: (v) => v >= 90, severity: "positive", titleSuffix: "우수", message: (v) => `매출 예측 정확도 ${v.toFixed(1)}%로 계획 신뢰도가 높습니다.` },
    ],
  },
  // Rule 7: 공헌이익률
  {
    id: "cm",
    title: "공헌이익률",
    category: "수익성",
    getValue: (c) => c.contributionMarginRate,
    conditions: [
      { test: (v) => v < 20, severity: "warning", titleSuffix: "저조", message: (v) => `공헌이익률 ${v.toFixed(1)}%로 고정비 회수가 어려울 수 있습니다.` },
    ],
  },
  // Rule 8: 매출총이익률
  {
    id: "gpm",
    title: "매출총이익률",
    category: "수익성",
    metric: "grossProfitMargin",
    getValue: (c) => safe(c.grossProfitMargin),
    conditions: [
      { test: (v) => v < 15, severity: "critical", titleSuffix: "위험", message: (v) => `매출총이익률 ${v.toFixed(1)}%로 원가 부담이 큽니다. 가격 정책 또는 원가 구조 재검토가 필요합니다.` },
      { test: (v) => v >= 30, severity: "positive", titleSuffix: "양호", message: (v) => `매출총이익률 ${v.toFixed(1)}%로 원가 관리가 잘 되고 있습니다.` },
    ],
  },
  // Rule 9: 영업레버리지
  {
    id: "olev",
    title: "영업레버리지",
    category: "수익성",
    metric: "operatingLeverage",
    getValue: (c) => safe(c.operatingLeverage),
    conditions: [
      { test: (v) => v < 80, severity: "warning", titleSuffix: "저하", message: (v) => `영업레버리지 ${v.toFixed(1)}%로 계획 대비 이익율이 크게 하락했습니다. 비용 증가 또는 저마진 판매 증가를 점검하세요.` },
      { test: (v) => v >= 120, severity: "positive", titleSuffix: "초과 달성", message: (v) => `영업레버리지 ${v.toFixed(1)}%로 계획 대비 수익 구조가 개선되었습니다.` },
    ],
  },
  // Rule 10: 매출 추세
  {
    id: "trend",
    title: "매출 추세",
    category: "매출",
    metric: "avgGrowthRate",
    getValue: (c) => {
      if (!c.salesTrend || c.avgGrowthRate === undefined || !isFinite(c.avgGrowthRate)) return undefined;
      return c.avgGrowthRate;
    },
    conditions: [
      { test: (v) => v < -5, severity: "warning", titleSuffix: "하락", message: (v) => `매출이 월평균 ${v.toFixed(1)}% 감소하는 하락 추세입니다. 원인 분석과 영업 전략 수정이 필요합니다.` },
      { test: (v) => v > 5, severity: "positive", titleSuffix: "성장", message: (v) => `매출이 월평균 ${v.toFixed(1)}% 성장하는 상승 추세입니다.` },
    ],
  },
  // Rule 11: 수주/매출 비율
  {
    id: "pipeline",
    title: "수주 파이프라인",
    category: "수주",
    metric: "orderToSalesRatio",
    getValue: (c) => {
      if (c.kpis.totalOrders <= 0 || c.kpis.totalSales <= 0) return undefined;
      const ratio = (c.kpis.totalOrders / c.kpis.totalSales) * 100;
      return isFinite(ratio) ? ratio : undefined;
    },
    conditions: [
      { test: (v) => v < 80, severity: "warning", titleSuffix: "부족", message: (v) => `수주/매출 비율 ${v.toFixed(0)}%로 향후 매출 확보를 위한 수주 활동 강화가 필요합니다.` },
      { test: (v) => v >= 120, severity: "positive", titleSuffix: "양호", message: (v) => `수주/매출 비율 ${v.toFixed(0)}%로 향후 매출 성장 기반이 확보되어 있습니다.` },
    ],
  },
  // Rule 12: 미수금/매출 비율
  {
    id: "ar",
    title: "미수금 비중",
    category: "미수금",
    metric: "receivablesToSalesRatio",
    getValue: (c) => {
      if (c.kpis.totalReceivables <= 0 || c.kpis.totalSales <= 0) return undefined;
      const ratio = (c.kpis.totalReceivables / c.kpis.totalSales) * 100;
      return isFinite(ratio) ? ratio : undefined;
    },
    conditions: [
      { test: (v) => v > 50, severity: "warning", titleSuffix: "과다", message: (v) => `미수금이 매출의 ${v.toFixed(0)}%에 달합니다. 채권 회수 강화 또는 신용 한도 재검토가 필요합니다.` },
    ],
  },
  // Rule 13: 매출원가율
  {
    id: "cogs",
    title: "매출원가율",
    category: "수익성",
    metric: "costOfGoodsRatio",
    getValue: (c) => safe(c.costOfGoodsRatio),
    conditions: [
      { test: (v) => v > 85, severity: "critical", titleSuffix: "과다", message: (v) => `매출원가율 ${v.toFixed(1)}%로 수익 확보가 어렵습니다. 원가 절감 또는 가격 인상을 검토하세요.` },
      { test: (v) => v > 75, severity: "warning", titleSuffix: "주의", message: (v) => `매출원가율 ${v.toFixed(1)}%로 수익성 관리에 주의가 필요합니다.` },
    ],
  },
  // Rule 14: 원재료비율
  {
    id: "material",
    title: "원재료비 비중",
    category: "수익성",
    metric: "materialCostRatio",
    getValue: (c) => safe(c.materialCostRatio),
    conditions: [
      { test: (v) => v > 40, severity: "warning", titleSuffix: "과다", message: (v) => `원재료비가 매출원가의 ${v.toFixed(1)}%를 차지합니다. 조달 단가 협상 또는 대체 원자재 검토가 필요합니다.` },
    ],
  },
  // Rule 15: 외주가공비율
  {
    id: "outsourcing",
    title: "외주가공비 비중",
    category: "수익성",
    metric: "outsourcingRatio",
    getValue: (c) => safe(c.outsourcingRatio),
    conditions: [
      { test: (v) => v > 30, severity: "warning", titleSuffix: "높음", message: (v) => `외주가공비가 매출원가의 ${v.toFixed(1)}%에 달합니다. 내재화 검토 또는 외주 단가 재협상을 고려하세요.` },
    ],
  },
];

// ─── 규칙 엔진 실행 ─────────────────────────────────────────────────

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  neutral: 2,
  positive: 3,
};

export function generateInsights(config: InsightConfig): Insight[] {
  const insights: Insight[] = [];

  for (const rule of RULES) {
    const value = rule.getValue(config);
    if (value === undefined) continue;

    // 첫 번째 매칭 조건 사용
    for (const cond of rule.conditions) {
      if (cond.test(value)) {
        insights.push({
          id: `${rule.id}-${cond.severity === "positive" ? "high" : cond.severity === "critical" ? "neg" : "low"}`,
          title: `${rule.title} ${cond.titleSuffix}`,
          message: cond.message(value, config),
          severity: cond.severity,
          category: rule.category,
          metric: rule.metric,
          value,
        });
        break;
      }
    }
  }

  insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return insights;
}

// ─── 트렌드 패턴 감지 ──────────────────────────────────────────────────

export interface TrendInsight {
  type: "consecutive_increase" | "consecutive_decrease";
  metric: string;
  months: number;
  startMonth: string;
  endMonth: string;
  totalChange: number;
  changePercent: number;
}

/**
 * 월별 데이터에서 연속 증가/감소 패턴(streak)을 감지합니다.
 * minConsecutive 개월 이상 연속된 방향성 변화를 TrendInsight로 반환합니다.
 */
export function detectTrendPatterns(
  monthlyData: Array<{ month: string; value: number }>,
  metricName: string,
  minConsecutive: number = 3
): TrendInsight[] {
  if (monthlyData.length < minConsecutive) return [];

  const sorted = [...monthlyData].sort((a, b) => a.month.localeCompare(b.month));
  const insights: TrendInsight[] = [];

  let streakType: "increase" | "decrease" | null = null;
  let streakStart = 0;
  let streakLength = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].value;
    const curr = sorted[i].value;
    const direction = curr > prev ? "increase" : curr < prev ? "decrease" : null;

    if (direction && direction === streakType) {
      streakLength++;
    } else {
      // Check if previous streak qualifies
      if (streakLength >= minConsecutive && streakType) {
        const startVal = sorted[streakStart].value;
        const endVal = sorted[streakStart + streakLength - 1].value;
        insights.push({
          type: streakType === "increase" ? "consecutive_increase" : "consecutive_decrease",
          metric: metricName,
          months: streakLength,
          startMonth: sorted[streakStart].month,
          endMonth: sorted[streakStart + streakLength - 1].month,
          totalChange: endVal - startVal,
          changePercent: startVal !== 0 ? ((endVal - startVal) / Math.abs(startVal)) * 100 : 0,
        });
      }
      // Reset
      streakType = direction;
      streakStart = i - 1;
      streakLength = direction ? 2 : 1;
      if (!direction) {
        streakStart = i;
        streakLength = 1;
      }
    }
  }

  // Check final streak
  if (streakLength >= minConsecutive && streakType) {
    const startVal = sorted[streakStart].value;
    const endVal = sorted[streakStart + streakLength - 1].value;
    insights.push({
      type: streakType === "increase" ? "consecutive_increase" : "consecutive_decrease",
      metric: metricName,
      months: streakLength,
      startMonth: sorted[streakStart].month,
      endMonth: sorted[streakStart + streakLength - 1].month,
      totalChange: endVal - startVal,
      changePercent: startVal !== 0 ? ((endVal - startVal) / Math.abs(startVal)) * 100 : 0,
    });
  }

  return insights;
}
