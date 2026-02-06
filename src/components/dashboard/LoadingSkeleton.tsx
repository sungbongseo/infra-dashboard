"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded bg-muted ${className ?? ""}`}
      style={style}
    />
  );
}

/** KPI 카드 4개 스켈레톤 */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Shimmer className="h-4 w-24" />
                <Shimmer className="h-8 w-32" />
              </div>
              <Shimmer className="h-10 w-10 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** 차트 카드 스켈레톤 */
export function ChartSkeleton({ height = "h-64 md:h-80" }: { height?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Shimmer className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <div className={`${height} flex items-end gap-2 pt-4`}>
          {[40, 65, 50, 80, 55, 70, 45, 60, 75, 48].map((h, i) => (
            <Shimmer
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${h}%` } as React.CSSProperties}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** 페이지 전체 로딩 스켈레톤 */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Shimmer className="h-7 w-48" />
        <Shimmer className="h-4 w-64" />
      </div>
      <KpiSkeleton />
      <ChartSkeleton />
      <ChartSkeleton />
    </div>
  );
}
