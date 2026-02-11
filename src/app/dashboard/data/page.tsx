"use client";

import { useMemo } from "react";
import { FileUploader } from "@/components/dashboard/FileUploader";
import { useDataStore } from "@/stores/dataStore";
import { calcDataQualityMetrics, type DataQualityMetrics } from "@/lib/excel/parser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/** 파일 타입별 한글 라벨 */
const TYPE_LABELS: Record<string, string> = {
  salesList: "매출리스트",
  collectionList: "수금리스트",
  orderList: "수주리스트",
  orgProfit: "조직별손익",
  teamContribution: "팀기여도",
  profitabilityAnalysis: "수익성분석",
  receivableAging: "매출채권",
  orgCustomerProfit: "조직별거래처손익",
  hqCustomerItemProfit: "거래처품목손익",
  customerItemDetail: "거래처별품목별손익",
};

/** 파일 타입별 필수 필드 */
const REQUIRED_FIELDS: Record<string, string[]> = {
  salesList: ["매출일", "매출처", "장부금액", "영업조직"],
  collectionList: ["수금일", "거래처명", "장부수금액", "영업조직"],
  orderList: ["수주일", "장부금액", "영업조직"],
  orgProfit: ["영업조직팀", "매출액"],
  teamContribution: ["영업조직팀", "영업담당사번", "매출액"],
  profitabilityAnalysis: ["영업조직팀", "품목"],
  receivableAging: ["판매처", "영업조직"],
  orgCustomerProfit: ["영업조직팀", "매출거래처", "매출액"],
  hqCustomerItemProfit: ["영업조직팀", "매출거래처", "품목", "매출액"],
  customerItemDetail: ["영업조직팀", "매출거래처", "품목", "제품군", "매출연월", "매출액"],
};

function getCompletenessColor(rate: number): string {
  if (rate >= 95) return "text-green-600 dark:text-green-400";
  if (rate >= 80) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getProgressColor(rate: number): string {
  if (rate >= 95) return "[&>div]:bg-green-500";
  if (rate >= 80) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

export default function DataManagementPage() {
  const salesList = useDataStore((s) => s.salesList);
  const collectionList = useDataStore((s) => s.collectionList);
  const orderList = useDataStore((s) => s.orderList);
  const orgProfit = useDataStore((s) => s.orgProfit);
  const teamContribution = useDataStore((s) => s.teamContribution);
  const profitabilityAnalysis = useDataStore((s) => s.profitabilityAnalysis);
  const receivableAging = useDataStore((s) => s.receivableAging);
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);
  const hqCustomerItemProfit = useDataStore((s) => s.hqCustomerItemProfit);
  const customerItemDetail = useDataStore((s) => s.customerItemDetail);

  /** receivableAging은 Map이므로 모든 소스를 합쳐서 하나의 배열로 변환 */
  const allAgingRecords = useMemo(() => {
    const records: any[] = [];
    Array.from(receivableAging.entries()).forEach(([, data]) => {
      records.push(...data);
    });
    return records;
  }, [receivableAging]);

  /** 로드된 데이터 타입별 배열 매핑 */
  const dataMap: Record<string, any[]> = useMemo(
    () => ({
      salesList,
      collectionList,
      orderList,
      orgProfit,
      teamContribution,
      profitabilityAnalysis,
      receivableAging: allAgingRecords,
      orgCustomerProfit,
      hqCustomerItemProfit,
      customerItemDetail,
    }),
    [salesList, collectionList, orderList, orgProfit, teamContribution, profitabilityAnalysis, allAgingRecords, orgCustomerProfit, hqCustomerItemProfit, customerItemDetail]
  );

  /** 로드된 타입만 필터링하고 품질 지표 계산 */
  const qualityMetrics: DataQualityMetrics[] = useMemo(() => {
    const metrics: DataQualityMetrics[] = [];
    for (const [type, data] of Object.entries(dataMap)) {
      if (data.length > 0) {
        const fields = REQUIRED_FIELDS[type] || [];
        metrics.push(calcDataQualityMetrics(data, type, fields));
      }
    }
    return metrics;
  }, [dataMap]);

  /** 전체 요약 통계 */
  const summary = useMemo(() => {
    if (qualityMetrics.length === 0) {
      return { loadedTypes: 0, totalRows: 0, avgCompleteness: 0 };
    }
    const totalRows = qualityMetrics.reduce((s, m) => s + m.totalRows, 0);
    const avgCompleteness =
      qualityMetrics.reduce((s, m) => s + m.completenessRate, 0) / qualityMetrics.length;
    return { loadedTypes: qualityMetrics.length, totalRows, avgCompleteness };
  }, [qualityMetrics]);

  const hasData = qualityMetrics.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">데이터 관리</h2>
        <p className="text-muted-foreground">
          엑셀 파일을 업로드하여 대시보드 데이터를 관리합니다
        </p>
      </div>
      <FileUploader />

      {/* 데이터 품질 지표 섹션 */}
      {hasData && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold tracking-tight">데이터 품질 지표</h3>

          {/* 전체 요약 카드 */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground">로드된 파일 유형</p>
                <p className="text-2xl font-bold mt-1">
                  {summary.loadedTypes}
                  <span className="text-sm font-normal text-muted-foreground ml-1">/ 10개</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground">전체 데이터 행 수</p>
                <p className="text-2xl font-bold mt-1">
                  {summary.totalRows.toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground ml-1">행</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground">전체 데이터 완전성</p>
                <p className={`text-2xl font-bold mt-1 ${getCompletenessColor(summary.avgCompleteness)}`}>
                  {summary.avgCompleteness.toFixed(1)}%
                </p>
                <Progress
                  value={summary.avgCompleteness}
                  className={`h-2 mt-2 ${getProgressColor(summary.avgCompleteness)}`}
                />
              </CardContent>
            </Card>
          </div>

          {/* 파일 타입별 품질 카드 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {qualityMetrics.map((m) => {
              const label = TYPE_LABELS[m.fileType] || m.fileType;
              const nullEntries = Object.entries(m.nullFieldCounts).filter(([, count]) => count > 0);
              return (
                <Card key={m.fileType}>
                  <CardHeader className="pb-2 p-4">
                    <CardTitle className="text-sm font-semibold">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">데이터 행</span>
                      <span className="font-medium">{m.totalRows.toLocaleString()}행</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">완전성</span>
                      <span className={`font-medium ${getCompletenessColor(m.completenessRate)}`}>
                        {m.completenessRate.toFixed(1)}%
                      </span>
                    </div>
                    <Progress
                      value={m.completenessRate}
                      className={`h-1.5 ${getProgressColor(m.completenessRate)}`}
                    />
                    {nullEntries.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">누락 필드:</p>
                        {nullEntries.map(([field, count]) => (
                          <div key={field} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{field}</span>
                            <span className="text-amber-600 dark:text-amber-400">
                              {count}건 ({(m.totalRows > 0 ? (count / m.totalRows) * 100 : 0).toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
