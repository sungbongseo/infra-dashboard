import { create } from "zustand";
import type { CustomerCompositeRisk } from "@/lib/analysis/customerCompositeRisk";

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: "lt" | "gt";
  threshold: number;
  severity: "warning" | "critical";
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: "warning" | "critical";
  message: string;
  timestamp: Date;
  dismissed: boolean;
  // P1: 거래처별 알림 추가 컨텍스트 (옵셔널)
  customerCode?: string;
  customerName?: string;
  category?: CustomerCompositeRisk["category"];
  /** AlertPanel 클릭 시 deep link (예: "/dashboard/receivables?tab=negotiation") */
  deepLink?: string;
}

interface KpiInput {
  collectionRate: number;
  operatingProfitRate: number;
  salesPlanAchievement: number;
}

export interface AlertHistoryEntry {
  id: string;
  title: string;
  severity: string;
  timestamp: number;
}

/** Metrics that were skipped due to missing data during last evaluate() */
export interface SkippedMetric {
  metric: string;
  label: string;
  reason: string;
}

interface AlertState {
  rules: AlertRule[];
  alerts: Alert[];
  alertHistory: AlertHistoryEntry[];
  skippedMetrics: SkippedMetric[];
  evaluate: (kpis: KpiInput, dso?: number, creditUsageRate?: number, receivableExtras?: { overdueRatio?: number; longTermRatio?: number; weightedAgingDays?: number }) => void;
  /** P1: 거래처별 위험 알림 평가 (Composite Risk Score 기반) */
  evaluateCustomerRisks: (risks: CustomerCompositeRisk[], threshold?: number) => void;
  dismissAlert: (id: string) => void;
  dismissAll: () => void;
  activeAlertCount: () => number;
  addToHistory: (alert: { id: string; title: string; severity: string }) => void;
  clearHistory: () => void;
}

const DEFAULT_RULES: AlertRule[] = [
  {
    id: "rule-collection-rate",
    name: "수금율 저조",
    metric: "collectionRate",
    condition: "lt",
    threshold: 70,
    severity: "warning",
    enabled: true,
  },
  {
    id: "rule-operating-profit",
    name: "영업이익율 위험",
    metric: "operatingProfitRate",
    condition: "lt",
    threshold: 5,
    severity: "critical",
    enabled: true,
  },
  {
    id: "rule-dso",
    name: "DSO 초과",
    metric: "dso",
    condition: "gt",
    threshold: 60,
    severity: "warning",
    enabled: true,
  },
  {
    id: "rule-credit-usage",
    name: "여신사용률 초과",
    metric: "creditUsageRate",
    condition: "gt",
    threshold: 100,
    severity: "critical",
    enabled: true,
  },
  {
    id: "rule-sales-achievement",
    name: "매출계획달성률 미달",
    metric: "salesPlanAchievement",
    condition: "lt",
    threshold: 80,
    severity: "warning",
    enabled: true,
  },
  {
    id: "rule-overdue-ratio-warning",
    name: "연체비율 경고",
    metric: "overdueRatio",
    condition: "gt",
    threshold: 30,
    severity: "warning",
    enabled: true,
  },
  {
    id: "rule-overdue-ratio-critical",
    name: "연체비율 위험",
    metric: "overdueRatio",
    condition: "gt",
    threshold: 50,
    severity: "critical",
    enabled: true,
  },
  {
    id: "rule-long-term-ratio",
    name: "장기미수 비율 경고",
    metric: "longTermRatio",
    condition: "gt",
    threshold: 20,
    severity: "warning",
    enabled: true,
  },
  {
    id: "rule-aging-deterioration",
    name: "가중평균 채권연령 경고",
    metric: "weightedAgingDays",
    condition: "gt",
    threshold: 90,
    severity: "warning",
    enabled: true,
  },
];

const METRIC_LABELS: Record<string, string> = {
  collectionRate: "수금율",
  operatingProfitRate: "영업이익율",
  dso: "DSO",
  creditUsageRate: "여신사용률",
  salesPlanAchievement: "매출계획달성률",
  overdueRatio: "연체비율",
  longTermRatio: "장기미수 비율",
  weightedAgingDays: "가중평균 채권연령",
};

const METRIC_UNITS: Record<string, string> = {
  collectionRate: "%",
  operatingProfitRate: "%",
  dso: "일",
  creditUsageRate: "%",
  salesPlanAchievement: "%",
  overdueRatio: "%",
  longTermRatio: "%",
  weightedAgingDays: "일",
};

function getMetricValue(
  metric: string,
  kpis: KpiInput,
  dso?: number,
  creditUsageRate?: number,
  receivableExtras?: { overdueRatio?: number; longTermRatio?: number; weightedAgingDays?: number },
): number | undefined {
  switch (metric) {
    case "collectionRate":
      return kpis.collectionRate;
    case "operatingProfitRate":
      return kpis.operatingProfitRate;
    case "salesPlanAchievement":
      return kpis.salesPlanAchievement;
    case "dso":
      return dso;
    case "creditUsageRate":
      return creditUsageRate;
    case "overdueRatio":
      return receivableExtras?.overdueRatio;
    case "longTermRatio":
      return receivableExtras?.longTermRatio;
    case "weightedAgingDays":
      return receivableExtras?.weightedAgingDays;
    default:
      return undefined;
  }
}

function checkViolation(
  value: number,
  condition: "lt" | "gt",
  threshold: number
): boolean {
  return condition === "lt" ? value < threshold : value > threshold;
}

function buildMessage(
  ruleName: string,
  metric: string,
  currentValue: number,
  condition: "lt" | "gt",
  threshold: number
): string {
  const label = METRIC_LABELS[metric] || metric;
  const unit = METRIC_UNITS[metric] || "";
  const dir = condition === "lt" ? "미만" : "초과";
  const displayValue = isFinite(currentValue) ? currentValue.toFixed(1) : "-";
  return `${ruleName}: ${label} ${displayValue}${unit} (기준 ${threshold}${unit} ${dir})`;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  rules: DEFAULT_RULES,
  alerts: [],
  alertHistory: [],
  skippedMetrics: [],

  evaluate: (kpis, dso, creditUsageRate, receivableExtras) => {
    const { rules, alerts: existingAlerts } = get();
    const dismissed = existingAlerts.filter((a) => a.dismissed);
    const dismissedRuleIds = new Set(dismissed.map((a) => a.ruleId));

    const newAlerts: Alert[] = [];
    const skipped: SkippedMetric[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const value = getMetricValue(rule.metric, kpis, dso, creditUsageRate, receivableExtras);
      if (value === undefined) {
        const receivableMetrics = ["dso", "creditUsageRate", "overdueRatio", "longTermRatio", "weightedAgingDays"];
        skipped.push({
          metric: rule.metric,
          label: METRIC_LABELS[rule.metric] || rule.metric,
          reason: receivableMetrics.includes(rule.metric)
            ? "미수금 에이징 데이터 미업로드"
            : "관련 데이터 미업로드",
        });
        continue;
      }

      if (checkViolation(value, rule.condition, rule.threshold)) {
        if (dismissedRuleIds.has(rule.id)) continue;

        newAlerts.push({
          id: `alert-${rule.id}-${Date.now()}`,
          ruleId: rule.id,
          ruleName: rule.name,
          metric: rule.metric,
          currentValue: value,
          threshold: rule.threshold,
          severity: rule.severity,
          message: buildMessage(
            rule.name,
            rule.metric,
            value,
            rule.condition,
            rule.threshold
          ),
          timestamp: new Date(),
          dismissed: false,
        });
      }
    }

    // Add triggered alerts to history
    for (const alert of newAlerts) {
      get().addToHistory({
        id: alert.id,
        title: alert.ruleName,
        severity: alert.severity,
      });
    }

    // Deduplicate skipped metrics by metric name
    const uniqueSkipped = Array.from(
      new Map(skipped.map((s) => [s.metric, s])).values()
    );

    set({ alerts: [...dismissed, ...newAlerts], skippedMetrics: uniqueSkipped });
  },

  /**
   * P1: 거래처별 위험 알림 자동 생성.
   * 위험점수 ≥ threshold(기본 70)인 거래처에 대해 alert 생성.
   * AlertPanel 클릭 시 협상 우선순위 탭으로 이동 (deepLink).
   */
  evaluateCustomerRisks: (risks, threshold = 70) => {
    const { alerts: existingAlerts } = get();
    const dismissedCustCodes = new Set(
      existingAlerts.filter(a => a.dismissed && a.customerCode).map(a => a.customerCode)
    );
    const dismissed = existingAlerts.filter(a => a.dismissed);

    // 비-거래처 알림은 보존 (기존 KPI/DSO 등)
    const nonCustomerAlerts = existingAlerts.filter(a => !a.customerCode);

    // 위험점수 ≥ threshold만 추출
    const targetRisks = risks.filter(r => r.riskScore >= threshold);

    const customerAlerts: Alert[] = [];
    for (const r of targetRisks) {
      // 사용자가 이전에 dismiss한 거래처는 제외
      if (dismissedCustCodes.has(r.거래처코드)) continue;

      const isTerminate = r.category === "거래중단";
      const severity: Alert["severity"] = isTerminate || r.riskScore >= 80 ? "critical" : "warning";
      const emoji = isTerminate ? "🚨🚨" : "🚨";

      // 핵심 메트릭 1줄 요약
      const m = r.metrics;
      const tags: string[] = [];
      if (m.totalReceivable >= 100_000_000) tags.push(`미수 ${(m.totalReceivable / 1e8).toFixed(1)}억`);
      if (m.creditUsageRate >= 0.8) tags.push(`한도 ${(m.creditUsageRate * 100).toFixed(0)}%`);
      if (m.deficitMonthCount >= 6) tags.push(`적자 ${m.deficitMonthCount}M`);
      if (m.longOverdueRatio >= 0.3) tags.push(`장기연체 ${(m.longOverdueRatio * 100).toFixed(0)}%`);
      const tagText = tags.length > 0 ? ` · ${tags.join(" · ")}` : "";

      customerAlerts.push({
        id: `alert-customer-${r.거래처코드}-${Date.now()}`,
        ruleId: `customer-risk-${r.거래처코드}`,
        ruleName: `거래처 위험 (${r.category})`,
        metric: "customerRiskScore",
        currentValue: r.riskScore,
        threshold,
        severity,
        message: `${emoji} ${r.거래처명} 위험점수 ${r.riskScore} · ${r.category}${tagText}`,
        timestamp: new Date(),
        dismissed: false,
        customerCode: r.거래처코드,
        customerName: r.거래처명,
        category: r.category,
        deepLink: "/dashboard/receivables?tab=negotiation",
      });
    }

    // 히스토리에 추가
    for (const alert of customerAlerts) {
      get().addToHistory({ id: alert.id, title: alert.ruleName, severity: alert.severity });
    }

    // 기존 비-거래처 alerts + dismissed 보존 + 신규 거래처 alerts
    set({ alerts: [...nonCustomerAlerts, ...dismissed.filter(a => a.customerCode), ...customerAlerts] });
  },

  dismissAlert: (id) => {
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, dismissed: true } : a
      ),
    }));
  },

  dismissAll: () => {
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, dismissed: true })),
    }));
  },

  activeAlertCount: () => {
    return get().alerts.filter((a) => !a.dismissed).length;
  },

  addToHistory: (alert) => {
    set((state) => {
      const entry: AlertHistoryEntry = {
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        timestamp: Date.now(),
      };
      const updated = [entry, ...state.alertHistory];
      return { alertHistory: updated.slice(0, 20) };
    });
  },

  clearHistory: () => {
    set({ alertHistory: [] });
  },
}));
