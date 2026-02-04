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
                {(description || formula) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {formula && <p className="font-mono text-xs mb-1">{formula}</p>}
                      {description && <p className="text-xs">{description}</p>}
                      {benchmark && <p className="text-xs text-muted-foreground mt-1">{benchmark}</p>}
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
