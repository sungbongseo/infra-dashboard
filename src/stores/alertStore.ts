import { create } from "zustand";

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
