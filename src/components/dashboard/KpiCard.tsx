"use client";

import { useId } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { formatCurrency, formatPercent, formatNumber, calcChangeRate, getChangeColor, getChangeArrow, safeFixed } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

interface KpiCardProps {
  title: string;
  value: number;
  previousValue?: number;
  sparklineData?: number[];
  format: "currency" | "percent" | "number";
  description?: string;
  formula?: string;
  benchmark?: string;
  reason?: string;
  icon?: React.ReactNode;
  compact?: boolean;
  onClick?: () => void;
}

export function KpiCard({
  title,
  value,
  previousValue,
  sparklineData,
  format,
  description,
  formula,
  benchmark,
  reason,
  icon,
  compact = true,
  onClick,
}: KpiCardProps) {
  const gradientId = useId();
  const changeRate = previousValue !== undefined ? calcChangeRate(value, previousValue) : null;
  const hasTooltip = description || formula || benchmark || reason;

  // Sparkline: convert number[] to chart data points
  const sparkChartData = sparklineData && sparklineData.length >= 2
    ? sparklineData.map((v, i) => ({ i, v }))
    : null;

  const formattedValue =
    format === "currency"
      ? formatCurrency(value, compact)
      : format === "percent"
      ? formatPercent(value)
      : formatNumber(value);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card
        role="status"
        aria-label={`${title}: ${formattedValue}`}
        className={cn("relative overflow-hidden", onClick && "cursor-pointer hover:ring-2 hover:ring-primary/20 transition-shadow")}
        onClick={onClick}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                {hasTooltip && (
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex items-center justify-center">
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-primary transition-colors cursor-help" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8} className="max-w-sm p-3 z-[60]">
                      {formula && (
                        <div className="mb-2">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">📐 계산방법</p>
                          <p className="font-mono text-xs bg-muted/50 rounded px-2 py-1 whitespace-pre-line">{formula}</p>
                        </div>
                      )}
                      {description && (
                        <div className="mb-2">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">📖 해석방법</p>
                          <p className="text-xs leading-relaxed">{description}</p>
                        </div>
                      )}
                      {benchmark && (
                        <div className={reason ? "mb-2" : "pt-1.5 border-t"}>
                          <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">📏 분석기준</p>
                          <p className="text-xs">{benchmark}</p>
                        </div>
                      )}
                      {reason && (
                        <div className="pt-1.5 border-t">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">💡 분석 필요 이유</p>
                          <p className="text-xs leading-relaxed">{reason}</p>
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-2xl font-bold tracking-tight">{formattedValue}</p>
              {sparkChartData && (
                <div className="h-8 w-full mt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkChartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(221.2, 83.2%, 53.3%)" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="hsl(221.2, 83.2%, 53.3%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="hsl(221.2, 83.2%, 53.3%)"
                        strokeWidth={1.5}
                        fill={`url(#${gradientId})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {changeRate !== null && (
                <p className={cn("text-xs font-medium", getChangeColor(changeRate))}>
                  {getChangeArrow(changeRate)} {safeFixed(Math.abs(changeRate))}%
                  <span className="text-muted-foreground ml-1">vs 이전</span>
                </p>
              )}
            </div>
            {icon && (
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">{icon}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
