import type { AgingSummary } from "@/lib/analysis/aging";
import type { AgingRiskAssessment, CreditUtilization } from "@/types";
import type { CCCAnalysis } from "@/lib/analysis/ccc";
import { formatCurrency } from "@/lib/utils";

export type ActionSeverity = "critical" | "warning" | "info";

export interface ActionItem {
  severity: ActionSeverity;
  category: string;
  title: string;
  detail: string;
  target?: string;
}

/**
 * 미수금 분석 데이터를 기반으로 자동 액션 아이템 생성
 * - 여신 한도 초과 거래처 감지
 * - DSO 기준 초과 경고
 * - 연체비율 임계값 경고
 * - 장기미수 비율 경고
 * - 고위험 거래처 수 경고
 */
export function generateReceivableActions(params: {
  summary?: AgingSummary;
  risks?: AgingRiskAssessment[];
  credits?: CreditUtilization[];
  cccAnalysis?: CCCAnalysis;
  longTermTotal?: number;
  longTermRatio?: number;
}): ActionItem[] {
  const actions: ActionItem[] = [];

  // Rule 1: 여신 한도 초과 거래처
  if (params.credits) {
    for (const c of params.credits) {
      if (c.사용률 >= 100) {
        actions.push({
          severity: "critical",
          category: "여신",
          title: `한도초과 거래처: ${c.판매처명}`,
          detail: `여신한도 ${formatCurrency(c.여신한도, true)} 대비 사용액 ${formatCurrency(c.총미수금, true)} (사용률 ${c.사용률.toFixed(0)}%)`,
          target: c.판매처명,
        });
      }
    }
  }

  // Rule 2: DSO 기준 초과
  if (params.cccAnalysis && params.cccAnalysis.avgDSO > 90) {
    actions.push({
      severity: "critical",
      category: "DSO",
      title: `전사 DSO ${params.cccAnalysis.avgDSO}일 — 즉시 수금 대책 필요`,
      detail:
        "매출채권 회수기간이 90일을 초과했습니다. 연체 거래처 집중 관리 및 결제조건 재협상을 권장합니다.",
    });
  } else if (params.cccAnalysis && params.cccAnalysis.avgDSO > 60) {
    actions.push({
      severity: "warning",
      category: "DSO",
      title: `전사 DSO ${params.cccAnalysis.avgDSO}일 — 수금 전략 점검`,
      detail:
        "매출채권 회수기간이 60일을 초과했습니다. 수금 프로세스 효율성을 점검하세요.",
    });
  }

  // Rule 3: 연체비율 경고
  if (params.summary && params.summary.total > 0) {
    const overdueTotal =
      params.summary.month3 +
      params.summary.month4 +
      params.summary.month5 +
      params.summary.month6 +
      params.summary.overdue;
    const overdueRatio = (overdueTotal / params.summary.total) * 100;

    if (overdueRatio > 50) {
      actions.push({
        severity: "critical",
        category: "연체",
        title: `연체비율 ${overdueRatio.toFixed(1)}% — 채권 건전성 위험`,
        detail:
          "전체 미수금의 50% 이상이 61일 이상 연체 상태입니다. 대손 위험이 높으므로 즉각 조치가 필요합니다.",
      });
    } else if (overdueRatio > 30) {
      actions.push({
        severity: "warning",
        category: "연체",
        title: `연체비율 ${overdueRatio.toFixed(1)}% — 관리 강화 필요`,
        detail:
          "전체 미수금의 30% 이상이 연체 상태입니다. 연체 거래처 독촉 및 수금 계획 수립을 권장합니다.",
      });
    }
  }

  // Rule 4: 장기미수 비율 경고
  if (params.longTermRatio !== undefined && params.longTermRatio > 20) {
    actions.push({
      severity: "warning",
      category: "장기미수",
      title: `장기미수 비율 ${params.longTermRatio.toFixed(1)}% — 대손 검토 필요`,
      detail:
        "6개월 이상 장기 미수금 비율이 20%를 초과합니다. 대손충당금 적정성을 재검토하세요.",
    });
  }

  // Rule 5: 고위험 거래처 수 경고
  if (params.risks) {
    const highRiskCustomers = params.risks.filter(
      (r) => r.riskGrade === "high",
    );
    if (highRiskCustomers.length > 5) {
      actions.push({
        severity: "warning",
        category: "리스크",
        title: `고위험 거래처 ${highRiskCustomers.length}건 — 집중 모니터링`,
        detail:
          "고위험으로 분류된 거래처가 5건을 초과합니다. 리스크 관리 탭에서 상세 검토하세요.",
      });
    }
  }

  // Rule 6: 여신 위험 거래처 다수
  if (params.credits) {
    const dangerCredits = params.credits.filter((c) => c.사용률 >= 80);
    if (dangerCredits.length > 3) {
      actions.push({
        severity: "info",
        category: "여신",
        title: `여신 경고 거래처 ${dangerCredits.length}건 — 한도 관리 필요`,
        detail:
          "여신사용률 80% 이상 거래처가 다수 존재합니다. 한도 증액 또는 거래 조건 재검토를 권장합니다.",
      });
    }
  }

  return actions.sort((a, b) => {
    const order: Record<ActionSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    return order[a.severity] - order[b.severity];
  });
}
