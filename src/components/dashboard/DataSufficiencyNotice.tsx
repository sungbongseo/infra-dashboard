"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataSufficiencyNoticeProps {
  title: string;
  reason: string;
  currentData: string;
  requiredData: string;
  alternativeTab?: { label: string; onClick: () => void };
}

export function DataSufficiencyNotice({
  title,
  reason,
  currentData,
  requiredData,
  alternativeTab,
}: DataSufficiencyNoticeProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="max-w-lg w-full rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">
              {title}
            </h3>
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              {reason}
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md bg-amber-100 dark:bg-amber-900/40 p-2.5">
                <p className="text-amber-600 dark:text-amber-400 font-medium mb-0.5">현재 데이터</p>
                <p className="text-amber-800 dark:text-amber-200 font-semibold">{currentData}</p>
              </div>
              <div className="rounded-md bg-amber-100 dark:bg-amber-900/40 p-2.5">
                <p className="text-amber-600 dark:text-amber-400 font-medium mb-0.5">필요 데이터</p>
                <p className="text-amber-800 dark:text-amber-200 font-semibold">{requiredData}</p>
              </div>
            </div>
            {alternativeTab && (
              <Button
                variant="outline"
                size="sm"
                onClick={alternativeTab.onClick}
                className="mt-2 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
              >
                {alternativeTab.label}
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
