"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { formatCurrency, formatPercent, formatNumber, calcChangeRate, getChangeColor, getChangeArrow } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface KpiCardProps {
  title: string;
  value: number;
  previousValue?: number;
  format: "currency" | "percent" | "number";
  description?: string;
  formula?: string;
  benchmark?: string;
  icon?: React.ReactNode;
  compact?: boolean;
}

export function KpiCard({
  title,
  value,
  previousValue,
  format,
  description,
  formula,
  benchmark,
  icon,
  compact = true,
}: KpiCardProps) {
  const changeRate = previousValue !== undefined ? calcChangeRate(value, previousValue) : null;
  const hasTooltip = description || formula || benchmark;

  const formattedValue =
    format === "currency"
      ? formatCurrency(value, compact)
      : format === "percent"
      ? formatPercent(value)
      : formatNumber(value);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="relative overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
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
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">📐 산출 로직</p>
                          <p className="font-mono text-xs bg-muted/50 rounded px-2 py-1 whitespace-pre-line">{formula}</p>
                        </div>
                      )}
                      {description && (
                        <div className="mb-2">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">📖 해석</p>
                          <p className="text-xs leading-relaxed">{description}</p>
                        </div>
                      )}
                      {benchmark && (
                        <div className="pt-1.5 border-t">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">🎯 기준</p>
                          <p className="text-xs">{benchmark}</p>
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-2xl font-bold tracking-tight">{formattedValue}</p>
              {changeRate !== null && (
                <p className={cn("text-xs font-medium", getChangeColor(changeRate))}>
                  {getChangeArrow(changeRate)} {Math.abs(changeRate).toFixed(1)}%
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
