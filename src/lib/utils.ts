import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (Math.abs(value) >= 1e8) {
      return `${(value / 1e8).toFixed(1)}억`;
    }
    if (Math.abs(value) >= 1e4) {
      return `${(value / 1e4).toFixed(0)}만`;
    }
  }
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function calcChangeRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function getChangeColor(value: number): string {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export function getChangeArrow(value: number): string {
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "—";
}

export const CHART_COLORS = [
  "hsl(221.2, 83.2%, 53.3%)",
  "hsl(142.1, 76.2%, 36.3%)",
  "hsl(262.1, 83.3%, 57.8%)",
  "hsl(24.6, 95%, 53.1%)",
  "hsl(346.8, 77.2%, 49.8%)",
  "hsl(188.7, 94.5%, 42.7%)",
  "hsl(43.3, 96.4%, 56.3%)",
];

export const RISK_COLORS = {
  low: "hsl(142.1, 76.2%, 36.3%)",
  medium: "hsl(38, 92%, 50%)",
  high: "hsl(0, 84.2%, 60.2%)",
};

/** Recharts 공통 tooltip 스타일 */
export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid hsl(var(--border))",
    backgroundColor: "hsl(var(--card))",
    color: "hsl(var(--card-foreground))",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    fontSize: 12,
  },
  labelStyle: { fontWeight: 600 },
};

// Date utilities
export function extractMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = String(dateStr).trim();
  if (d.includes("-")) return d.substring(0, 7);
  if (d.includes("/")) {
    const parts = d.split("/");
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}`;
    }
    return "";
  }
  if (d.length === 8 && /^\d{8}$/.test(d)) return `${d.substring(0, 4)}-${d.substring(4, 6)}`;
  // Excel serial number
  const serial = Number(d);
  if (!isNaN(serial) && serial > 40000 && serial < 100000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  return "";
}

// Org filter helpers
export function filterByOrg<T extends Record<string, any>>(
  data: T[],
  orgNames: Set<string>,
  field: string = "영업조직"
): T[] {
  if (orgNames.size === 0) return data;
  return data.filter(row => orgNames.has(String(row[field] || "").trim()));
}

// Date range filter helper
// dateRange: { from: "YYYY-MM", to: "YYYY-MM" }
// dateField: the field name in the record that contains the date (e.g. "매출일", "수금일", "수주일")
export function filterByDateRange<T extends Record<string, any>>(
  data: T[],
  dateRange: { from: string; to: string } | null,
  dateField: string
): T[] {
  if (!dateRange || !dateRange.from || !dateRange.to) return data;
  const from = dateRange.from; // "YYYY-MM"
  const to = dateRange.to;     // "YYYY-MM"
  return data.filter(row => {
    const month = extractMonth(String(row[dateField] || ""));
    if (!month) return false;
    return month >= from && month <= to;
  });
}
