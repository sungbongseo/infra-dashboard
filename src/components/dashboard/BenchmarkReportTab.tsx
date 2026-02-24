"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
} from "recharts";
import { Gauge, Target, TrendingUp, TrendingDown, FileText, AlertTriangle, Lightbulb, ClipboardList } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, AXIS_TICK, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CHART_COLORS, TOOLTIP_STYLE, cn } from "@/lib/utils";
import { calcBenchmarkComparison, type BenchmarkMetric } from "@/lib/analysis/industryBenchmark";
import { generateMonthlyReport, type ReportSection, type ReportInput } from "@/lib/analysis/autoReport";

// ─── Props ────────────────────────────────────────────────────

interface BenchmarkReportTabProps {
  kpis: {
    totalSales: number;
    totalOrders: number;
    totalCollection: number;
    collectionRate: number;
    operatingProfitRate: number;
    salesPlanAchievement: number;
    totalReceivables: number;
  };
  gpRate: number;
  dso: number | undefined;
  salesGrowth: number;
  topOrg: string;
  bottomOrg: string;
  atRiskCustomers: number;
  totalCustomers: number;
  contributionMarginRate: number;
}

// ─── Constants ────────────────────────────────────────────────

const STATUS_COLORS: Record<BenchmarkMetric["status"], string> = {
  above: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  at: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  below: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_LABELS: Record<BenchmarkMetric["status"], string> = {
  above: "우수",
  at: "보통",
  below: "미달",
};

const SECTION_CONFIG: Record<ReportSection["type"], {
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
  iconColor: string;
}> = {
  summary: {
    icon: <ClipboardList className="h-4 w-4" />,
    borderColor: "border-l-slate-400 dark:border-l-slate-500",
    bgColor: "bg-slate-50 dark:bg-slate-900/30",
    iconColor: "text-slate-600 dark:text-slate-400",
  },
  highlight: {
    icon: <TrendingUp className="h-4 w-4" />,
    borderColor: "border-l-emerald-500",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  risk: {
    icon: <AlertTriangle className="h-4 w-4" />,
    borderColor: "border-l-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    iconColor: "text-red-600 dark:text-red-400",
  },
  recommendation: {
    icon: <Lightbulb className="h-4 w-4" />,
    borderColor: "border-l-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
};

const PRIORITY_VARIANT: Record<ReportSection["priority"], "destructive" | "warning" | "secondary"> = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
};

const PRIORITY_LABELS: Record<ReportSection["priority"], string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

// ─── Helpers ──────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score > 75) return "text-emerald-600 dark:text-emerald-400";
  if (score > 50) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function getScoreRingColor(score: number): string {
  if (score > 75) return "ring-emerald-500/30";
  if (score > 50) return "ring-amber-500/30";
  return "ring-red-500/30";
}

function getScoreLabel(score: number): string {
  if (score > 75) return "우수";
  if (score > 50) return "보통";
  return "개선 필요";
}

function getBarColor(status: BenchmarkMetric["status"]): string {
  if (status === "above") return CHART_COLORS[1]; // green
  if (status === "at") return CHART_COLORS[6]; // yellow
  return CHART_COLORS[4]; // red
}

// ─── Component ────────────────────────────────────────────────

export function BenchmarkReportTab({
  kpis,
  gpRate,
  dso,
  salesGrowth,
  topOrg,
  bottomOrg,
  atRiskCustomers,
  totalCustomers,
  contributionMarginRate,
}: BenchmarkReportTabProps) {
  // ── Benchmark ──────────────────────────────────────────────
  const actuals = useMemo(
    () => ({
      매출총이익율: gpRate,
      영업이익율: kpis.operatingProfitRate,
      수금율: kpis.collectionRate,
      DSO: dso ?? 0,
      매출성장률: salesGrowth,
      계획달성률: kpis.salesPlanAchievement,
      공헌이익율: contributionMarginRate,
    }),
    [gpRate, kpis.operatingProfitRate, kpis.collectionRate, dso, salesGrowth, kpis.salesPlanAchievement, contributionMarginRate]
  );

  const benchmarkResult = useMemo(() => calcBenchmarkComparison(actuals), [actuals]);

  const chartData = useMemo(
    () =>
      benchmarkResult.metrics.map((m) => ({
        name: m.name,
        실적: m.value,
        "업종 평균": m.benchmark,
        unit: m.unit,
        status: m.status,
        gap: m.gap,
        gapPercent: m.gapPercent,
      })),
    [benchmarkResult.metrics]
  );

  // ── Auto Report ────────────────────────────────────────────
  const period = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  }, []);

  const reportInput: ReportInput = useMemo(
    () => ({
      totalSales: kpis.totalSales,
      totalOrders: kpis.totalOrders,
      totalCollections: kpis.totalCollection,
      collectionRate: kpis.collectionRate,
      gpRate,
      opRate: kpis.operatingProfitRate,
      planAchievement: kpis.salesPlanAchievement,
      dso: dso ?? 0,
      salesGrowth,
      topOrg,
      bottomOrg,
      atRiskCustomers,
      totalCustomers,
    }),
    [kpis, gpRate, dso, salesGrowth, topOrg, bottomOrg, atRiskCustomers, totalCustomers]
  );

  const report = useMemo(() => generateMonthlyReport(reportInput, period), [reportInput, period]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════
          Section 1: Industry Benchmark
          ═══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 mb-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">업종 벤치마크</h2>
        <span className="text-xs text-muted-foreground ml-1">({benchmarkResult.industry})</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Overall Score Gauge */}
        <Card className={cn("flex flex-col items-center justify-center ring-2", getScoreRingColor(benchmarkResult.overallScore))}>
          <CardContent className="py-8 flex flex-col items-center">
            <Gauge className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">종합 경쟁력 점수</p>
            <p className={cn("text-5xl font-bold tracking-tight", getScoreColor(benchmarkResult.overallScore))}>
              {isFinite(benchmarkResult.overallScore) ? benchmarkResult.overallScore.toFixed(0) : "-"}
            </p>
            <p className={cn("text-sm font-medium mt-1", getScoreColor(benchmarkResult.overallScore))}>
              {getScoreLabel(benchmarkResult.overallScore)}
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              {benchmarkResult.metrics.length}개 지표 기준 업종 대비 종합 평가
            </p>
          </CardContent>
        </Card>

        {/* Benchmark Comparison Bar Chart */}
        <ChartCard
          title="벤치마크 비교"
          formula="각 지표의 실적값과 업종 평균을 비교"
          description="자사 실적(파란색)과 업종 평균(회색)을 나란히 비교합니다. 실적이 업종 평균을 초과하면 우수, 90~110% 범위이면 보통, 미만이면 미달로 분류됩니다."
          benchmark="DSO는 낮을수록 우수, 나머지 지표는 높을수록 우수"
          className="xl:col-span-2"
        >
          <ChartContainer height="h-72 md:h-96">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 20 }}>
              <CartesianGrid {...GRID_PROPS} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} />
              <YAxis dataKey="name" type="category" tick={AXIS_TICK} width={80} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, _name: any, props: any) => {
                  const unit = props?.payload?.unit || "";
                  const v = Number(value);
                  return `${isFinite(v) ? v.toFixed(1) : "-"}${unit}`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="실적"
                fill={CHART_COLORS[0]}
                radius={BAR_RADIUS_RIGHT}
                {...ANIMATION_CONFIG}
                activeBar={ACTIVE_BAR}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={getBarColor(entry.status as BenchmarkMetric["status"])} />
                ))}
              </Bar>
              <Bar
                dataKey="업종 평균"
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.35}
                radius={BAR_RADIUS_RIGHT}
                {...ANIMATION_CONFIG}
              />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Status Badges Table */}
      <ChartCard
        title="지표별 상세 비교"
        description="각 지표의 실적, 업종 평균, 격차, 평가 상태를 표로 정리합니다."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">지표</th>
                <th className="text-right p-3 font-medium">실적</th>
                <th className="text-right p-3 font-medium">업종 평균</th>
                <th className="text-right p-3 font-medium">격차</th>
                <th className="text-right p-3 font-medium">격차(%)</th>
                <th className="text-center p-3 font-medium">평가</th>
              </tr>
            </thead>
            <tbody>
              {benchmarkResult.metrics.map((m) => (
                <tr key={m.name} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-3 font-medium">{m.name}</td>
                  <td className="p-3 text-right font-mono">
                    {isFinite(m.value) ? m.value.toFixed(1) : "-"}{m.unit}
                  </td>
                  <td className="p-3 text-right font-mono text-muted-foreground">
                    {m.benchmark.toFixed(1)}{m.unit}
                  </td>
                  <td className={cn(
                    "p-3 text-right font-mono",
                    m.gap > 0 ? "text-emerald-600 dark:text-emerald-400" : m.gap < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                  )}>
                    {m.gap > 0 ? "+" : ""}{isFinite(m.gap) ? m.gap.toFixed(1) : "-"}{m.unit}
                  </td>
                  <td className={cn(
                    "p-3 text-right font-mono",
                    m.gapPercent > 0 ? "text-emerald-600 dark:text-emerald-400" : m.gapPercent < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                  )}>
                    {m.gapPercent > 0 ? "+" : ""}{isFinite(m.gapPercent) ? m.gapPercent.toFixed(1) : "-"}%
                  </td>
                  <td className="p-3 text-center">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_COLORS[m.status])}>
                      {m.status === "above" ? <TrendingUp className="h-3 w-3 mr-1" /> : m.status === "below" ? <TrendingDown className="h-3 w-3 mr-1" /> : null}
                      {STATUS_LABELS[m.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* ═══════════════════════════════════════════════════════
          Section 2: Auto Report
          ═══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 mt-8 mb-2">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">경영 보고서</h2>
      </div>

      {/* Report Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{report.period} 경영 분석 보고서</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                생성일: {report.generatedAt}
              </p>
            </div>
            <Badge variant="secondary" className="text-xs">
              자동 생성
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Report Sections */}
      <div className="space-y-3">
        {report.sections.map((section, idx) => {
          const config = SECTION_CONFIG[section.type];
          return (
            <Card
              key={idx}
              className={cn("border-l-4 overflow-hidden", config.borderColor, config.bgColor)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 flex-shrink-0", config.iconColor)}>
                    {config.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-sm font-semibold">{section.title}</h3>
                      <Badge variant={PRIORITY_VARIANT[section.priority]} className="text-[10px] px-1.5 py-0">
                        {PRIORITY_LABELS[section.priority]}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                      {section.content}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Report Footer */}
      <div className="text-xs text-muted-foreground text-center py-2">
        본 보고서는 업로드된 데이터 기반으로 자동 생성되었습니다. 상세 분석은 각 탭을 참조하십시오.
      </div>
    </div>
  );
}
