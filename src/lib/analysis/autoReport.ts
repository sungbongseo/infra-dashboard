import type { Insight } from "./insightGenerator";

// ─── Interfaces ───────────────────────────────────────────────

export interface ReportSection {
  title: string;
  content: string;
  type: "summary" | "highlight" | "risk" | "recommendation" | "insight";
  priority: "high" | "medium" | "low";
}

export interface MonthlyReport {
  period: string;
  generatedAt: string;
  sections: ReportSection[];
}

export interface ReportInput {
  totalSales: number;
  totalOrders: number;
  totalCollections: number;
  collectionRate: number;
  gpRate: number;
  opRate: number;
  planAchievement: number;
  dso: number;
  salesGrowth: number;
  topOrg: string;
  bottomOrg: string;
  atRiskCustomers: number;
  totalCustomers: number;
}

// ─── Executive 1-Pager Interfaces ────────────────────────────

export interface ExecutiveOnePager {
  period: string;
  generatedAt: string;
  coreKpis: ExecutiveKpi[];
  topRisks: ExecutiveItem[];
  topOpportunities: ExecutiveItem[];
  recommendedActions: ExecutiveItem[];
  monthOverMonth: ExecutiveMoM[];
}

export interface ExecutiveKpi {
  label: string;
  value: number;
  format: "currency" | "percent" | "number" | "days";
  change?: number;  // vs previous period (%)
  status: "good" | "warning" | "critical";
}

export interface ExecutiveItem {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
}

export interface ExecutiveMoM {
  label: string;
  current: number;
  previous: number;
  changeRate: number;
  format: "currency" | "percent";
}

export interface ExecutiveReportInput extends ReportInput {
  prevTotalSales?: number;
  prevTotalOrders?: number;
  prevCollectionRate?: number;
  prevOpRate?: number;
  winRate?: number;
  avgSalesCycle?: number;
  salesVelocity?: number;
  insights?: Insight[];
}

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  if (!isFinite(n)) return "-";
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}억원`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(0)}만원`;
  return `${n.toFixed(0)}원`;
}

function sf(n: number, d = 1): string {
  return isFinite(n) ? n.toFixed(d) : "-";
}

// ─── Core Function ────────────────────────────────────────────

/**
 * Generate monthly executive report text from KPI data.
 */
export function generateMonthlyReport(input: ReportInput, period: string, insights?: Insight[]): MonthlyReport {
  const sections: ReportSection[] = [];

  // 1. Executive Summary
  sections.push({
    title: "경영 요약",
    content: `${period} 기준 총 매출 ${fmt(input.totalSales)}, 수주 ${fmt(input.totalOrders)}, 수금 ${fmt(input.totalCollections)}을 기록하였습니다. 수금율은 ${sf(input.collectionRate)}%, 매출총이익율 ${sf(input.gpRate)}%, 영업이익율 ${sf(input.opRate)}%입니다.`,
    type: "summary",
    priority: "high",
  });

  // 2. Plan Achievement
  if (input.planAchievement > 0) {
    const achieveStatus = input.planAchievement >= 100 ? "달성" : `미달(${sf(input.planAchievement)}%)`;
    sections.push({
      title: "계획 달성 현황",
      content: `매출 계획 ${achieveStatus}. ${
        input.planAchievement >= 100
          ? "목표 초과 달성으로 양호한 성과입니다."
          : `목표 대비 ${sf(100 - input.planAchievement)}%p 부족합니다. 잔여 기간 집중 관리가 필요합니다.`
      }`,
      type: input.planAchievement >= 100 ? "highlight" : "risk",
      priority: input.planAchievement >= 90 ? "medium" : "high",
    });
  }

  // 3. Growth
  sections.push({
    title: "성장 추세",
    content: `전기 대비 매출 성장률 ${input.salesGrowth >= 0 ? "+" : ""}${sf(input.salesGrowth)}%. ${
      input.salesGrowth > 5
        ? "양호한 성장세를 유지하고 있습니다."
        : input.salesGrowth > 0
          ? "소폭 성장 중이나 추가 성장 동력이 필요합니다."
          : "역성장 상태로 원인 분석 및 대응이 시급합니다."
    }`,
    type: input.salesGrowth > 0 ? "highlight" : "risk",
    priority: input.salesGrowth < 0 ? "high" : "medium",
  });

  // 4. Collection & DSO
  if (input.collectionRate < 80 || input.dso > 90) {
    sections.push({
      title: "수금 리스크",
      content: `수금율 ${sf(input.collectionRate)}%${input.collectionRate < 80 ? "(주의)" : ""}, DSO ${sf(input.dso, 0)}일${input.dso > 90 ? "(경고)" : ""}. ${
        input.dso > 90
          ? "매출채권 회수 기간이 업종 평균(60일) 대비 길어 현금흐름 관리가 필요합니다."
          : "양호한 수준입니다."
      }`,
      type: "risk",
      priority: input.dso > 90 ? "high" : "medium",
    });
  }

  // 5. Org Performance
  if (input.topOrg || input.bottomOrg) {
    sections.push({
      title: "조직별 성과",
      content: `최우수 조직: ${input.topOrg || "-"}. ${
        input.bottomOrg
          ? `개선 필요 조직: ${input.bottomOrg}. 조직 간 성과 격차 해소를 위한 지원 방안 검토가 필요합니다.`
          : ""
      }`,
      type: "summary",
      priority: "medium",
    });
  }

  // 6. Customer Risk
  if (input.atRiskCustomers > 0) {
    const riskRate = input.totalCustomers > 0 ? (input.atRiskCustomers / input.totalCustomers) * 100 : 0;
    sections.push({
      title: "거래처 이탈 위험",
      content: `전체 ${input.totalCustomers}개 거래처 중 ${input.atRiskCustomers}개(${sf(riskRate)}%)가 이탈 위험 상태입니다. 핵심 거래처 리텐션 캠페인을 검토하십시오.`,
      type: "risk",
      priority: riskRate > 20 ? "high" : "medium",
    });
  }

  // 7. Recommendations
  const recs: string[] = [];
  if (input.collectionRate < 85) recs.push("수금율 개선을 위한 채권 관리 강화");
  if (input.opRate < 5) recs.push("영업이익율 제고를 위한 비용 구조 개선");
  if (input.salesGrowth < 0) recs.push("매출 역성장 원인 분석 및 신규 수주 확대");
  if (input.dso > 60) recs.push("DSO 단축을 위한 선수금 비중 확대 검토");

  if (recs.length > 0) {
    sections.push({
      title: "핵심 권고사항",
      content: recs.map((r, i) => `${i + 1}. ${r}`).join("\n"),
      type: "recommendation",
      priority: "high",
    });
  }

  // 8. InsightGenerator 결과 통합 (선택적)
  if (insights && insights.length > 0) {
    const criticalInsights = insights.filter(i => i.severity === "critical" || i.severity === "warning");
    const positiveInsights = insights.filter(i => i.severity === "positive");

    if (criticalInsights.length > 0) {
      sections.push({
        title: "주요 경영 인사이트 (경고)",
        content: criticalInsights.map(i => `[${i.category}] ${i.title}: ${i.message}`).join("\n"),
        type: "insight",
        priority: "high",
      });
    }
    if (positiveInsights.length > 0) {
      sections.push({
        title: "긍정적 인사이트",
        content: positiveInsights.map(i => `[${i.category}] ${i.title}: ${i.message}`).join("\n"),
        type: "insight",
        priority: "low",
      });
    }
  }

  return {
    period,
    generatedAt: new Date().toISOString().slice(0, 10),
    sections,
  };
}

// ─── Executive 1-Pager Helpers ───────────────────────────────

function calcChange(current: number, previous?: number): number | undefined {
  if (previous === undefined || previous === 0 || !isFinite(current) || !isFinite(previous)) return undefined;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return isFinite(change) ? change : undefined;
}

function getKpiStatus(value: number, goodThreshold: number, warningThreshold: number): "good" | "warning" | "critical" {
  if (!isFinite(value)) return "critical";
  if (value >= goodThreshold) return "good";
  if (value >= warningThreshold) return "warning";
  return "critical";
}

function getKpiStatusInverted(value: number, goodThreshold: number, warningThreshold: number): "good" | "warning" | "critical" {
  if (!isFinite(value)) return "critical";
  if (value <= goodThreshold) return "good";
  if (value <= warningThreshold) return "warning";
  return "critical";
}

function deriveRisks(input: ExecutiveReportInput): ExecutiveItem[] {
  const risks: ExecutiveItem[] = [];

  // From insights
  if (input.insights) {
    const criticals = input.insights
      .filter(i => i.severity === "critical" || i.severity === "warning")
      .sort((a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1));
    for (const ins of criticals.slice(0, 3)) {
      risks.push({
        title: ins.title,
        detail: ins.message,
        priority: ins.severity === "critical" ? "high" : "medium",
      });
    }
  }

  // Fallback from data if not enough insights
  if (risks.length < 3) {
    if (input.collectionRate < 80) {
      risks.push({ title: "수금율 저조", detail: `수금율 ${sf(input.collectionRate)}%로 현금흐름 리스크`, priority: "high" });
    }
    if (input.opRate < 5) {
      risks.push({ title: "수익성 악화", detail: `영업이익율 ${sf(input.opRate)}%로 비용 관리 필요`, priority: "high" });
    }
    if (input.dso > 60) {
      risks.push({ title: "채권 회수 지연", detail: `DSO ${sf(input.dso, 0)}일로 업종 평균 초과`, priority: "medium" });
    }
  }

  return risks.slice(0, 3);
}

function deriveOpportunities(input: ExecutiveReportInput): ExecutiveItem[] {
  const opps: ExecutiveItem[] = [];

  if (input.insights) {
    const positives = input.insights.filter(i => i.severity === "positive");
    for (const ins of positives.slice(0, 3)) {
      opps.push({ title: ins.title, detail: ins.message, priority: "medium" });
    }
  }

  if (opps.length < 3) {
    if (input.salesGrowth > 5) {
      opps.push({ title: "매출 성장세", detail: `${sf(input.salesGrowth)}% 성장 유지`, priority: "medium" });
    }
    if (input.planAchievement >= 100) {
      opps.push({ title: "계획 초과 달성", detail: `목표 대비 ${sf(input.planAchievement)}% 달성`, priority: "low" });
    }
  }

  return opps.slice(0, 3);
}

function deriveActions(input: ExecutiveReportInput): ExecutiveItem[] {
  const actions: ExecutiveItem[] = [];

  // From insights with action field
  if (input.insights) {
    const withActions = input.insights.filter(i => i.action && (i.severity === "critical" || i.severity === "warning"));
    for (const ins of withActions.slice(0, 3)) {
      actions.push({ title: ins.title, detail: ins.action!, priority: ins.severity === "critical" ? "high" : "medium" });
    }
  }

  // Fallback
  if (actions.length < 3) {
    if (input.collectionRate < 85) actions.push({ title: "수금 강화", detail: "연체 거래처 집중 관리 + 수금 독촉 일정 수립", priority: "high" });
    if (input.opRate < 5) actions.push({ title: "비용 절감", detail: "원가절감 TF 구성 + 고마진 제품 확대", priority: "high" });
    if (input.salesGrowth < 0) actions.push({ title: "매출 회복", detail: "신규 수주 확대 + 기존 거래처 크로스셀링", priority: "high" });
    if (input.dso > 60) actions.push({ title: "DSO 단축", detail: "선수금 비중 확대 + 결제조건 재협상", priority: "medium" });
  }

  return actions.slice(0, 3);
}

function deriveMoM(input: ExecutiveReportInput): ExecutiveMoM[] {
  const items: ExecutiveMoM[] = [];

  if (input.prevTotalSales !== undefined) {
    const change = calcChange(input.totalSales, input.prevTotalSales);
    items.push({ label: "매출액", current: input.totalSales, previous: input.prevTotalSales, changeRate: change ?? 0, format: "currency" });
  }
  if (input.prevTotalOrders !== undefined) {
    const change = calcChange(input.totalOrders, input.prevTotalOrders);
    items.push({ label: "수주액", current: input.totalOrders, previous: input.prevTotalOrders, changeRate: change ?? 0, format: "currency" });
  }
  if (input.prevCollectionRate !== undefined) {
    const change = calcChange(input.collectionRate, input.prevCollectionRate);
    items.push({ label: "수금율", current: input.collectionRate, previous: input.prevCollectionRate, changeRate: change ?? 0, format: "percent" });
  }
  if (input.prevOpRate !== undefined) {
    const change = calcChange(input.opRate, input.prevOpRate);
    items.push({ label: "영업이익율", current: input.opRate, previous: input.prevOpRate, changeRate: change ?? 0, format: "percent" });
  }

  return items;
}

// ─── Executive 1-Pager Generator ─────────────────────────────

/**
 * Generate executive 1-pager summary from KPI data.
 * Produces a structured report with core KPIs, risks, opportunities,
 * recommended actions, and month-over-month comparison.
 */
export function generateExecutiveOnePager(input: ExecutiveReportInput, period: string): ExecutiveOnePager {
  // 1. Core KPIs (5개)
  const coreKpis: ExecutiveKpi[] = [
    {
      label: "매출액",
      value: input.totalSales,
      format: "currency",
      change: calcChange(input.totalSales, input.prevTotalSales),
      status: getKpiStatus(input.planAchievement, 90, 80),
    },
    {
      label: "영업이익율",
      value: input.opRate,
      format: "percent",
      change: calcChange(input.opRate, input.prevOpRate),
      status: getKpiStatus(input.opRate, 10, 5),
    },
    {
      label: "수금율",
      value: input.collectionRate,
      format: "percent",
      change: calcChange(input.collectionRate, input.prevCollectionRate),
      status: getKpiStatus(input.collectionRate, 85, 70),
    },
    {
      label: "DSO",
      value: input.dso,
      format: "days",
      status: getKpiStatusInverted(input.dso, 30, 60),
    },
    {
      label: "계획달성율",
      value: input.planAchievement,
      format: "percent",
      status: getKpiStatus(input.planAchievement, 100, 80),
    },
  ];

  // 2. Top 3 Risks
  const topRisks = deriveRisks(input);

  // 3. Top 3 Opportunities
  const topOpportunities = deriveOpportunities(input);

  // 4. Recommended Actions
  const recommendedActions = deriveActions(input);

  // 5. Month-over-Month comparison
  const monthOverMonth = deriveMoM(input);

  return {
    period,
    generatedAt: new Date().toISOString().slice(0, 10),
    coreKpis,
    topRisks: topRisks.slice(0, 3),
    topOpportunities: topOpportunities.slice(0, 3),
    recommendedActions: recommendedActions.slice(0, 3),
    monthOverMonth,
  };
}
