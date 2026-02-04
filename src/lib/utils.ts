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
