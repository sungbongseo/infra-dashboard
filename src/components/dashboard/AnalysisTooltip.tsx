"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface AnalysisTooltipProps {
  title: string;
  formula?: string;
  description?: string;
  benchmark?: string;
  reason?: string;
}

export function AnalysisTooltip({ title, formula, description, benchmark, reason }: AnalysisTooltipProps) {
  const hasContent = formula || description || benchmark || reason;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-semibold">{title}</span>
      {hasContent && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button type="button" className="inline-flex items-center justify-center">
              <Info className="h-4 w-4 text-muted-foreground/70 hover:text-primary transition-colors cursor-help" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8} className="max-w-sm p-4 z-[60]">
            {formula && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">📐 계산방법</p>
                <p className="font-mono text-xs bg-muted/50 rounded px-2 py-1.5 leading-relaxed whitespace-pre-line">{formula}</p>
              </div>
            )}
            {description && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">📖 해석방법</p>
                <p className="text-xs leading-relaxed">{description}</p>
              </div>
            )}
            {benchmark && (
              <div className={reason ? "mb-3" : "pt-2 border-t"}>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">📏 분석기준</p>
                <p className="text-xs leading-relaxed">{benchmark}</p>
              </div>
            )}
            {reason && (
              <div className="pt-2 border-t">
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">💡 분석 필요 이유</p>
                <p className="text-xs leading-relaxed">{reason}</p>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
