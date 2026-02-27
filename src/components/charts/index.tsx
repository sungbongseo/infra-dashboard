"use client";

export { ChartContainer } from "./ChartContainer";

/**
 * 공통 차트 프리셋 - 반복되는 Recharts 설정을 상수로 통합
 */

/** CartesianGrid 기본 설정 */
export const GRID_PROPS = {
  strokeDasharray: "3 3",
  className: "stroke-muted",
} as const;

/** X축 기본 설정 */
export const AXIS_TICK = { fontSize: 11 } as const;
export const AXIS_TICK_SM = { fontSize: 10 } as const;

/** Bar 모서리 둥글기 프리셋 */
export const BAR_RADIUS_TOP = [4, 4, 0, 0] as [number, number, number, number];
export const BAR_RADIUS_RIGHT = [0, 4, 4, 0] as [number, number, number, number];

/** 차트 애니메이션 설정 */
export const ANIMATION_CONFIG = {
  animationDuration: 600,
  animationEasing: "ease-out" as const,
};

/** Bar 차트 호버 효과 (activeBar) */
export const ACTIVE_BAR = {
  fill: "hsl(var(--primary))",
  fillOpacity: 0.85,
  stroke: "hsl(var(--primary))",
  strokeWidth: 1,
} as const;

/** Pie/Donut 활성 세그먼트 효과 */
export const ACTIVE_PIE_SHAPE = {
  outerRadius: 8,
  strokeWidth: 2,
  stroke: "hsl(var(--primary))",
} as const;

/** Y축 라벨 프리셋 */
export const yAxisLabel = (value: string, position: "insideLeft" | "insideRight" = "insideLeft") => ({
  value,
  angle: position === "insideLeft" ? -90 : 90,
  position,
  style: { fontSize: 12 },
});

/** 공통 Tooltip 포맷터 */
export const tooltipFormatters = {
  /** 통화 포맷: (value) => formatCurrency(value) */
  currency: (formatCurrency: (v: number, compact?: boolean) => string) =>
    (value: number) => formatCurrency(Number(value)),

  /** 퍼센트 포맷: (value) => "XX.X%" */
  percent: (value: number) => `${Number(value).toFixed(1)}%`,

  /** 일수 포맷: (value) => "XX일" */
  days: (value: number) => `${value}일`,

  /** 건수 포맷: (value) => "XX건" */
  count: (value: number) => `${Number(value).toLocaleString()}건`,
};

/** 스마트 라벨 말줄임 */
export function truncateLabel(text: string, maxLen: number = 10): string {
  if (!text || text.length <= maxLen) return text;
  return text.substring(0, maxLen - 1) + "\u2026";
}

/** 긴 한국어 라벨용 XAxis 프리셋 */
export const XAXIS_ANGLED = {
  angle: -35, textAnchor: "end" as const,
  height: 70, tick: { fontSize: 10 },
} as const;

/** 카테고리 YAxis 프리셋 (한국어 조직명) */
export const YAXIS_CATEGORY = {
  width: 85, tick: { fontSize: 10 },
} as const;

/** 데이터 개수 기반 적응형 폰트 */
export function getAdaptiveFontSize(count: number) {
  if (count <= 5) return 12;
  if (count <= 10) return 11;
  if (count <= 20) return 10;
  return 9;
}

/** Pie 차트 외부 라벨 렌더러 (3% 미만 세그먼트 라벨 생략) */
export function PieOuterLabel(props: any) {
  const { cx, cy, midAngle, outerRadius: or, name, percent } = props;
  if (!name || !percent || percent < 0.03) return null;
  const RADIAN = Math.PI / 180;
  const radius = (or || 130) + 25;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="hsl(var(--foreground))"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
    >
      {truncateLabel(name, 8)} {(percent * 100).toFixed(1)}%
    </text>
  );
}

/** 조건부 색상 (값 기준) */
export function getValueColor(value: number, thresholds: { good: number; warning: number }) {
  if (value >= thresholds.good) return "text-emerald-600 dark:text-emerald-400";
  if (value >= thresholds.warning) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

/** 마진율 색상 (표준 임계값: 20% 양호, 10% 주의) */
export function getMarginColor(margin: number) {
  return getValueColor(margin, { good: 20, warning: 10 });
}
