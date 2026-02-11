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
}

export function generateInsights(config: InsightConfig): Insight[] {
  const insights: Insight[] = [];
  const { kpis } = config;

  const safe = (v: number) => isFinite(v) ? v : 0;

  // Rule 1: Collection rate (순수 수금율 사용 - 선수금 제외)
  const effectiveCollectionRate = safe(config.netCollectionRate ?? kpis.collectionRate);
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
  if (isFinite(kpis.operatingProfitRate) && kpis.operatingProfitRate < 0) {
    insights.push({
      id: "op-neg",
      title: "영업적자 발생",
      message: `영업이익율 ${kpis.operatingProfitRate.toFixed(1)}%로 적자 상태입니다. 비용 구조 점검이 시급합니다.`,
      severity: "critical",
      category: "수익성",
      metric: "operatingProfitRate",
      value: kpis.operatingProfitRate,
    });
  } else if (isFinite(kpis.operatingProfitRate) && kpis.operatingProfitRate < 5) {
    insights.push({
      id: "op-low",
      title: "영업이익율 저조",
      message: `영업이익율 ${kpis.operatingProfitRate.toFixed(1)}%로 수익성 개선이 필요합니다. 원가절감 또는 고마진 제품 확대를 검토하세요.`,
      severity: "warning",
      category: "수익성",
      metric: "operatingProfitRate",
      value: kpis.operatingProfitRate,
    });
  } else if (isFinite(kpis.operatingProfitRate) && kpis.operatingProfitRate >= 10) {
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
  if (isFinite(kpis.salesPlanAchievement) && kpis.salesPlanAchievement >= 100) {
    insights.push({
      id: "plan-over",
      title: "매출 계획 초과 달성",
      message: `매출계획달성률 ${kpis.salesPlanAchievement.toFixed(1)}%로 목표를 초과 달성했습니다.`,
      severity: "positive",
      category: "매출",
      metric: "salesPlanAchievement",
      value: kpis.salesPlanAchievement,
    });
  } else if (isFinite(kpis.salesPlanAchievement) && kpis.salesPlanAchievement < 80) {
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
  if (config.dso !== undefined && isFinite(config.dso)) {
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
  if (config.ccc !== undefined && isFinite(config.ccc)) {
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

  // Rule 8: Gross profit margin
  if (config.grossProfitMargin !== undefined && isFinite(config.grossProfitMargin)) {
    if (config.grossProfitMargin < 15) {
      insights.push({
        id: "gpm-low",
        title: "매출총이익률 위험",
        message: `매출총이익률 ${config.grossProfitMargin.toFixed(1)}%로 원가 부담이 큽니다. 가격 정책 또는 원가 구조 재검토가 필요합니다.`,
        severity: "critical",
        category: "수익성",
        metric: "grossProfitMargin",
        value: config.grossProfitMargin,
      });
    } else if (config.grossProfitMargin >= 30) {
      insights.push({
        id: "gpm-high",
        title: "매출총이익률 양호",
        message: `매출총이익률 ${config.grossProfitMargin.toFixed(1)}%로 원가 관리가 잘 되고 있습니다.`,
        severity: "positive",
        category: "수익성",
        metric: "grossProfitMargin",
        value: config.grossProfitMargin,
      });
    }
  }

  // Rule 9: Operating leverage (plan vs actual margin)
  if (config.operatingLeverage !== undefined && isFinite(config.operatingLeverage)) {
    if (config.operatingLeverage < 80) {
      insights.push({
        id: "olev-low",
        title: "영업레버리지 저하",
        message: `영업레버리지 ${config.operatingLeverage.toFixed(1)}%로 계획 대비 이익율이 크게 하락했습니다. 비용 증가 또는 저마진 판매 증가를 점검하세요.`,
        severity: "warning",
        category: "수익성",
        metric: "operatingLeverage",
        value: config.operatingLeverage,
      });
    } else if (config.operatingLeverage >= 120) {
      insights.push({
        id: "olev-high",
        title: "영업레버리지 초과 달성",
        message: `영업레버리지 ${config.operatingLeverage.toFixed(1)}%로 계획 대비 수익 구조가 개선되었습니다.`,
        severity: "positive",
        category: "수익성",
        metric: "operatingLeverage",
        value: config.operatingLeverage,
      });
    }
  }

  // Rule 10: Sales trend
  if (config.salesTrend && config.avgGrowthRate !== undefined && isFinite(config.avgGrowthRate)) {
    if (config.salesTrend === "down" && config.avgGrowthRate < -5) {
      insights.push({
        id: "trend-down",
        title: "매출 하락 추세",
        message: `매출이 월평균 ${config.avgGrowthRate.toFixed(1)}% 감소하는 하락 추세입니다. 원인 분석과 영업 전략 수정이 필요합니다.`,
        severity: "warning",
        category: "매출",
        metric: "avgGrowthRate",
        value: config.avgGrowthRate,
      });
    } else if (config.salesTrend === "up" && config.avgGrowthRate > 5) {
      insights.push({
        id: "trend-up",
        title: "매출 성장 추세",
        message: `매출이 월평균 ${config.avgGrowthRate.toFixed(1)}% 성장하는 상승 추세입니다.`,
        severity: "positive",
        category: "매출",
        metric: "avgGrowthRate",
        value: config.avgGrowthRate,
      });
    }
  }

  // Rule 11: Order vs Sales ratio (pipeline health)
  if (kpis.totalOrders > 0 && kpis.totalSales > 0) {
    const orderToSalesRatio = (kpis.totalOrders / kpis.totalSales) * 100;
    if (isFinite(orderToSalesRatio)) {
      if (orderToSalesRatio < 80) {
        insights.push({
          id: "pipeline-low",
          title: "수주 파이프라인 부족",
          message: `수주/매출 비율 ${orderToSalesRatio.toFixed(0)}%로 향후 매출 확보를 위한 수주 활동 강화가 필요합니다.`,
          severity: "warning",
          category: "수주",
          metric: "orderToSalesRatio",
          value: orderToSalesRatio,
        });
      } else if (orderToSalesRatio >= 120) {
        insights.push({
          id: "pipeline-high",
          title: "수주 파이프라인 양호",
          message: `수주/매출 비율 ${orderToSalesRatio.toFixed(0)}%로 향후 매출 성장 기반이 확보되어 있습니다.`,
          severity: "positive",
          category: "수주",
          metric: "orderToSalesRatio",
          value: orderToSalesRatio,
        });
      }
    }
  }

  // Rule 12: Receivables to sales ratio
  if (kpis.totalReceivables > 0 && kpis.totalSales > 0) {
    const receivablesToSalesRatio = (kpis.totalReceivables / kpis.totalSales) * 100;
    if (isFinite(receivablesToSalesRatio) && receivablesToSalesRatio > 50) {
      insights.push({
        id: "ar-high",
        title: "미수금 비중 과다",
        message: `미수금이 매출의 ${receivablesToSalesRatio.toFixed(0)}%에 달합니다. 채권 회수 강화 또는 신용 한도 재검토가 필요합니다.`,
        severity: "warning",
        category: "미수금",
        metric: "receivablesToSalesRatio",
        value: receivablesToSalesRatio,
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
