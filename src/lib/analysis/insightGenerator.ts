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
}

export function generateInsights(config: InsightConfig): Insight[] {
  const insights: Insight[] = [];
  const { kpis } = config;

  // Rule 1: Collection rate (순수 수금율 사용 - 선수금 제외)
  const effectiveCollectionRate = config.netCollectionRate ?? kpis.collectionRate;
  if (effectiveCollectionRate >= 95) {
    insights.push({
      id: "col-high",
      title: "순수 수금율 우수",
      message: `순수 수금율 ${effectiveCollectionRate.toFixed(1)}%로 매우 양호합니다 (선수금 제외 기준).`,
      severity: "positive",
      category: "수금",
      metric: "netCollectionRate",
      value: effectiveCollectionRate,
    });
  } else if (effectiveCollectionRate < 70) {
    insights.push({
      id: "col-low",
      title: "순수 수금율 저조 경고",
      message: `순수 수금율 ${effectiveCollectionRate.toFixed(1)}%로 목표(70%) 미달입니다 (선수금 제외 기준). 연체 거래처 집중 관리가 필요합니다.`,
      severity: "critical",
      category: "수금",
      metric: "netCollectionRate",
      value: effectiveCollectionRate,
    });
  } else if (effectiveCollectionRate < 85) {
    insights.push({
      id: "col-med",
      title: "순수 수금율 주의",
      message: `순수 수금율 ${effectiveCollectionRate.toFixed(1)}%로 개선이 필요합니다 (선수금 제외 기준).`,
      severity: "warning",
      category: "수금",
      metric: "netCollectionRate",
      value: effectiveCollectionRate,
    });
  }

  // Rule 2: Operating profit rate
  if (kpis.operatingProfitRate < 0) {
    insights.push({
      id: "op-neg",
      title: "영업적자 발생",
      message: `영업이익율 ${kpis.operatingProfitRate.toFixed(1)}%로 적자 상태입니다. 비용 구조 점검이 시급합니다.`,
      severity: "critical",
      category: "수익성",
      metric: "operatingProfitRate",
      value: kpis.operatingProfitRate,
    });
  } else if (kpis.operatingProfitRate < 5) {
    insights.push({
      id: "op-low",
      title: "영업이익율 저조",
      message: `영업이익율 ${kpis.operatingProfitRate.toFixed(1)}%로 수익성 개선이 필요합니다. 원가절감 또는 고마진 제품 확대를 검토하세요.`,
      severity: "warning",
      category: "수익성",
      metric: "operatingProfitRate",
      value: kpis.operatingProfitRate,
    });
  } else if (kpis.operatingProfitRate >= 10) {
    insights.push({
      id: "op-high",
      title: "영업이익율 양호",
      message: `영업이익율 ${kpis.operatingProfitRate.toFixed(1)}%로 수익성이 양호합니다.`,
      severity: "positive",
      category: "수익성",
      metric: "operatingProfitRate",
      value: kpis.operatingProfitRate,
    });
  }

  // Rule 3: Sales plan achievement
  if (kpis.salesPlanAchievement >= 100) {
    insights.push({
      id: "plan-over",
      title: "매출 계획 초과 달성",
      message: `매출계획달성률 ${kpis.salesPlanAchievement.toFixed(1)}%로 목표를 초과 달성했습니다.`,
      severity: "positive",
      category: "매출",
      metric: "salesPlanAchievement",
      value: kpis.salesPlanAchievement,
    });
  } else if (kpis.salesPlanAchievement < 80) {
    insights.push({
      id: "plan-low",
      title: "매출 계획 미달",
      message: `매출계획달성률 ${kpis.salesPlanAchievement.toFixed(1)}%로 목표(80%) 미달입니다. 영업 활동 강화가 필요합니다.`,
      severity: "warning",
      category: "매출",
      metric: "salesPlanAchievement",
      value: kpis.salesPlanAchievement,
    });
  }

  // Rule 4: DSO
  if (config.dso !== undefined) {
    if (config.dso > 90) {
      insights.push({
        id: "dso-high",
        title: "DSO 과다",
        message: `매출채권 회수기간 ${config.dso.toFixed(0)}일로 매우 길어 현금흐름에 부정적입니다. 채권 회수 속도 개선이 시급합니다.`,
        severity: "critical",
        category: "미수금",
        metric: "dso",
        value: config.dso,
      });
    } else if (config.dso > 60) {
      insights.push({
        id: "dso-med",
        title: "DSO 주의",
        message: `매출채권 회수기간 ${config.dso.toFixed(0)}일로 업종 평균(60일) 이상입니다.`,
        severity: "warning",
        category: "미수금",
        metric: "dso",
        value: config.dso,
      });
    } else if (config.dso <= 30) {
      insights.push({
        id: "dso-low",
        title: "DSO 우수",
        message: `매출채권 회수기간 ${config.dso.toFixed(0)}일로 현금 회수가 빠릅니다.`,
        severity: "positive",
        category: "미수금",
        metric: "dso",
        value: config.dso,
      });
    }
  }

  // Rule 5: CCC
  if (config.ccc !== undefined) {
    if (config.ccc < 0) {
      insights.push({
        id: "ccc-neg",
        title: "현금전환주기 우수",
        message: `CCC ${config.ccc.toFixed(0)}일로 매입 결제 전에 매출 회수가 이루어지고 있습니다.`,
        severity: "positive",
        category: "수금",
      });
    } else if (config.ccc > 60) {
      insights.push({
        id: "ccc-high",
        title: "현금전환주기 주의",
        message: `CCC ${config.ccc.toFixed(0)}일로 운전자본 부담이 큽니다. DSO 단축과 DPO 연장을 동시에 추진하세요.`,
        severity: "warning",
        category: "수금",
      });
    }
  }

  // Rule 6: Forecast accuracy
  if (config.forecastAccuracy !== undefined) {
    if (config.forecastAccuracy < 70) {
      insights.push({
        id: "fc-low",
        title: "예측 정확도 저조",
        message: `매출 예측 정확도 ${config.forecastAccuracy.toFixed(1)}%로 계획 수립 프로세스 개선이 필요합니다.`,
        severity: "warning",
        category: "매출",
      });
    } else if (config.forecastAccuracy >= 90) {
      insights.push({
        id: "fc-high",
        title: "예측 정확도 우수",
        message: `매출 예측 정확도 ${config.forecastAccuracy.toFixed(1)}%로 계획 신뢰도가 높습니다.`,
        severity: "positive",
        category: "매출",
      });
    }
  }

  // Rule 7: Contribution margin
  if (config.contributionMarginRate !== undefined) {
    if (config.contributionMarginRate < 20) {
      insights.push({
        id: "cm-low",
        title: "공헌이익률 저조",
        message: `공헌이익률 ${config.contributionMarginRate.toFixed(1)}%로 고정비 회수가 어려울 수 있습니다.`,
        severity: "warning",
        category: "수익성",
      });
    }
  }

  // Sort: critical first, then warning, then neutral, then positive
  const severityOrder: Record<InsightSeverity, number> = {
    critical: 0,
    warning: 1,
    neutral: 2,
    positive: 3,
  };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return insights;
}
