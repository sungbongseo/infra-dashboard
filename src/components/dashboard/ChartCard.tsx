"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AnalysisTooltip } from "./AnalysisTooltip";
import { ErrorBoundary } from "./ErrorBoundary";

interface ChartCardProps {
  title: string;
  formula?: string;
  description?: string;
  benchmark?: string;
  reason?: string;
  dataSourceType?: "snapshot" | "period";
  isDateFiltered?: boolean;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  isEmpty?: boolean;
}

function DataSourceBadge({ type, isFiltered }: { type?: "snapshot" | "period"; isFiltered?: boolean }) {
  if (!type || !isFiltered) return null;

  if (type === "period") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 whitespace-nowrap">
        📅 기간 조회
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
      📋 스냅샷
    </span>
  );
}

export function ChartCard({ title, formula, description, benchmark, reason, dataSourceType, isDateFiltered, children, className, action, isEmpty }: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AnalysisTooltip
              title={title}
              formula={formula}
              description={description}
              benchmark={benchmark}
              reason={reason}
            />
            <DataSourceBadge type={dataSourceType} isFiltered={isDateFiltered} />
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            데이터가 없습니다
          </div>
        ) : (
          <ErrorBoundary>{children}</ErrorBoundary>
        )}
      </CardContent>
    </Card>
  );
}
