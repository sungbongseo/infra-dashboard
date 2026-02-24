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

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  if (!isFinite(n)) return "-";
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}억원`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(0)}만원`;
  return `${n.toFixed(0)}원`;
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
    content: `${period} 기준 총 매출 ${fmt(input.totalSales)}, 수주 ${fmt(input.totalOrders)}, 수금 ${fmt(input.totalCollections)}을 기록하였습니다. 수금율은 ${input.collectionRate.toFixed(1)}%, 매출총이익율 ${input.gpRate.toFixed(1)}%, 영업이익율 ${input.opRate.toFixed(1)}%입니다.`,
    type: "summary",
    priority: "high",
  });

  // 2. Plan Achievement
  if (input.planAchievement > 0) {
    const achieveStatus = input.planAchievement >= 100 ? "달성" : `미달(${input.planAchievement.toFixed(1)}%)`;
    sections.push({
      title: "계획 달성 현황",
      content: `매출 계획 ${achieveStatus}. ${
        input.planAchievement >= 100
          ? "목표 초과 달성으로 양호한 성과입니다."
          : `목표 대비 ${(100 - input.planAchievement).toFixed(1)}%p 부족합니다. 잔여 기간 집중 관리가 필요합니다.`
      }`,
      type: input.planAchievement >= 100 ? "highlight" : "risk",
      priority: input.planAchievement >= 90 ? "medium" : "high",
    });
  }

  // 3. Growth
  sections.push({
    title: "성장 추세",
    content: `전기 대비 매출 성장률 ${input.salesGrowth >= 0 ? "+" : ""}${input.salesGrowth.toFixed(1)}%. ${
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
      content: `수금율 ${input.collectionRate.toFixed(1)}%${input.collectionRate < 80 ? "(주의)" : ""}, DSO ${input.dso.toFixed(0)}일${input.dso > 90 ? "(경고)" : ""}. ${
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
      content: `전체 ${input.totalCustomers}개 거래처 중 ${input.atRiskCustomers}개(${riskRate.toFixed(1)}%)가 이탈 위험 상태입니다. 핵심 거래처 리텐션 캠페인을 검토하십시오.`,
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
