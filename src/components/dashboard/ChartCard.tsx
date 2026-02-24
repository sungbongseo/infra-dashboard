"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AnalysisTooltip } from "./AnalysisTooltip";
import { ErrorBoundary } from "./ErrorBoundary";

interface ChartCardProps {
  title: string;
  formula?: string;
  description?: string;
  benchmark?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  isEmpty?: boolean;
}

export function ChartCard({ title, formula, description, benchmark, children, className, action, isEmpty }: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <AnalysisTooltip
            title={title}
            formula={formula}
            description={description}
            benchmark={benchmark}
          />
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
