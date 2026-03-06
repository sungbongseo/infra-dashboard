"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Lightbulb, TrendingUp, TrendingDown, Minus, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { generateExecutiveOnePager, type ExecutiveReportInput, type ExecutiveKpi, type ExecutiveItem } from "@/lib/analysis/autoReport";
import type { Insight } from "@/lib/analysis/insightGenerator";

// ─── Props ────────────────────────────────────────────────────

interface ExecutiveSummaryTabProps {
  totalSales: number;
  totalOrders: number;
  totalCollections: number;
  collectionRate: number;
  gpRate: number;
  opRate: number;
  planAchievement: number;
  dso: number;
  salesGrowth: number;
  topOrg: string;
  bottomOrg: string;
  atRiskCustomers: number;
  totalCustomers: number;
  prevTotalSales?: number;
  prevTotalOrders?: number;
  prevCollectionRate?: number;
  prevOpRate?: number;
  winRate?: number;
  avgSalesCycle?: number;
  salesVelocity?: number;
  insights?: Insight[];
}

// ─── Helpers ────────────────────────────────────────────────────

const STATUS_COLORS: Record<ExecutiveKpi["status"], string> = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_LABELS: Record<ExecutiveKpi["status"], string> = {
  good: "양호",
  warning: "주의",
  critical: "위험",
};

const PRIORITY_COLORS: Record<ExecutiveItem["priority"], string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-emerald-500",
};

function formatKpiValue(value: number, format: ExecutiveKpi["format"]): string {
  if (!isFinite(value)) return "-";
  switch (format) {
    case "currency": return formatCurrency(value, true);
    case "percent": return formatPercent(value);
    case "days": return `${value.toFixed(0)}일`;
    case "number": return value.toLocaleString();
  }
}

// ─── Component ────────────────────────────────────────────────

export function ExecutiveSummaryTab(props: ExecutiveSummaryTabProps) {
  const period = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  }, []);

  const input: ExecutiveReportInput = useMemo(() => ({
    totalSales: props.totalSales,
    totalOrders: props.totalOrders,
    totalCollections: props.totalCollections,
    collectionRate: props.collectionRate,
    gpRate: props.gpRate,
    opRate: props.opRate,
    planAchievement: props.planAchievement,
    dso: props.dso,
    salesGrowth: props.salesGrowth,
    topOrg: props.topOrg,
    bottomOrg: props.bottomOrg,
    atRiskCustomers: props.atRiskCustomers,
    totalCustomers: props.totalCustomers,
    prevTotalSales: props.prevTotalSales,
    prevTotalOrders: props.prevTotalOrders,
    prevCollectionRate: props.prevCollectionRate,
    prevOpRate: props.prevOpRate,
    winRate: props.winRate,
    avgSalesCycle: props.avgSalesCycle,
    salesVelocity: props.salesVelocity,
    insights: props.insights,
  }), [props]);

  const report = useMemo(() => generateExecutiveOnePager(input, period), [input, period]);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">경영진 보고 (1-Pager)</h2>
          <Badge variant="secondary" className="text-xs">{report.generatedAt}</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="gap-1.5"
        >
          <Printer className="h-4 w-4" />
          인쇄
        </Button>
      </div>

      {/* Print header */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="text-xl font-bold">{period} 경영진 보고서</h1>
        <p className="text-sm text-muted-foreground">생성일: {report.generatedAt}</p>
      </div>

      {/* Core KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 print:grid-cols-5">
        {report.coreKpis.map((kpi) => (
          <Card key={kpi.label} className="relative overflow-hidden">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">{kpi.label}</p>
              <p className="text-xl font-bold tracking-tight">{formatKpiValue(kpi.value, kpi.format)}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_COLORS[kpi.status])}>
                  {STATUS_LABELS[kpi.status]}
                </span>
                {kpi.change !== undefined && isFinite(kpi.change) && (
                  <span className={cn("text-xs font-medium flex items-center gap-0.5",
                    kpi.change > 0 ? "text-emerald-600 dark:text-emerald-400" :
                    kpi.change < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                  )}>
                    {kpi.change > 0 ? <TrendingUp className="h-3 w-3" /> :
                     kpi.change < 0 ? <TrendingDown className="h-3 w-3" /> :
                     <Minus className="h-3 w-3" />}
                    {kpi.change > 0 ? "+" : ""}{kpi.change.toFixed(1)}%
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Three columns: Risks / Opportunities / Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 print:grid-cols-3">
        {/* Risks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Top 3 리스크
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.topRisks.length === 0 ? (
              <p className="text-xs text-muted-foreground">식별된 리스크가 없습니다.</p>
            ) : report.topRisks.map((risk, i) => (
              <div key={i} className={cn("border-l-4 rounded-r pl-3 py-2", PRIORITY_COLORS[risk.priority])}>
                <p className="text-xs font-semibold">{risk.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{risk.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Opportunities */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Top 3 기회
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.topOpportunities.length === 0 ? (
              <p className="text-xs text-muted-foreground">식별된 기회가 없습니다.</p>
            ) : report.topOpportunities.map((opp, i) => (
              <div key={i} className="border-l-4 border-l-emerald-500 rounded-r pl-3 py-2">
                <p className="text-xs font-semibold">{opp.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opp.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-500" />
              추천 액션
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.recommendedActions.length === 0 ? (
              <p className="text-xs text-muted-foreground">추천 액션이 없습니다.</p>
            ) : report.recommendedActions.map((action, i) => (
              <div key={i} className={cn("border-l-4 rounded-r pl-3 py-2", PRIORITY_COLORS[action.priority])}>
                <p className="text-xs font-semibold">{action.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{action.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Month-over-Month */}
      {report.monthOverMonth.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">전월 대비 변화</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {report.monthOverMonth.map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className={cn("text-lg font-bold",
                    item.changeRate > 0 ? "text-emerald-600 dark:text-emerald-400" :
                    item.changeRate < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                  )}>
                    {item.changeRate > 0 ? "+" : ""}{isFinite(item.changeRate) ? item.changeRate.toFixed(1) : "0"}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.format === "currency" ? formatCurrency(item.previous, true) : formatPercent(item.previous)}
                    {" -> "}
                    {item.format === "currency" ? formatCurrency(item.current, true) : formatPercent(item.current)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Print footer */}
      <div className="text-xs text-center text-muted-foreground print:block">
        본 보고서는 업로드된 데이터 기반으로 자동 생성되었습니다.
      </div>

      {/* Print-optimized CSS */}
      <style jsx global>{`
        @media print {
          body { font-size: 11px; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
          .print\\:grid-cols-5 { grid-template-columns: repeat(5, 1fr); }
          .print\\:space-y-4 > * + * { margin-top: 1rem; }
          header, nav, aside, [data-sidebar] { display: none !important; }
          main { margin: 0 !important; padding: 1rem !important; }
        }
      `}</style>
    </div>
  );
}
