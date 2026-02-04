"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface AnalysisTooltipProps {
  title: string;
  formula?: string;
  description?: string;
  benchmark?: string;
}

export function AnalysisTooltip({ title, formula, description, benchmark }: AnalysisTooltipProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-semibold">{title}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          <div className="space-y-1">
            {formula && (
              <p className="font-mono text-xs bg-muted px-2 py-1 rounded">{formula}</p>
            )}
            {description && <p className="text-xs">{description}</p>}
            {benchmark && (
              <p className="text-xs text-muted-foreground border-t pt-1 mt-1">{benchmark}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
