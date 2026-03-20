"use client";

import { useMemo } from "react";
import { FileUploader } from "@/components/dashboard/FileUploader";
import { useDataStore } from "@/stores/dataStore";
import { calcDataQualityMetrics, type DataQualityMetrics } from "@/lib/excel/parser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FileText, Database, Building2, Clock } from "lucide-react";

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
  itemCostDetail: "품목별매출원가(상세)",
  itemProfitability: "품목별수익성분석(회계)",
  inventoryMovement: "품목별수불현황",
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
  itemCostDetail: ["영업조직팀", "품목", "매출액", "매출총이익", "공헌이익"],
  itemProfitability: ["영업조직팀", "품목", "매출액", "매출총이익", "영업이익"],
  inventoryMovement: ["품목계정그룹", "품목", "품목명", "기초", "입고", "출고", "기말"],
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
  const uploadedFiles = useDataStore((s) => s.uploadedFiles);
  const orgNames = useDataStore((s) => s.orgNames);
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
  const itemCostDetail = useDataStore((s) => s.itemCostDetail);
  const itemProfitability = useDataStore((s) => s.itemProfitability);
  const inventoryMovement = useDataStore((s) => s.inventoryMovement);

  /** receivableAging은 Map이므로 모든 소스를 합쳐서 하나의 배열로 변환 */
  const allAgingRecords = useMemo(() => {
    const records: any[] = [];
    Array.from(receivableAging.entries()).forEach(([, data]) => {
      records.push(...data);
    });
    return records;
  }, [receivableAging]);

  /** inventoryMovement은 Map이므로 모든 공장을 합쳐서 하나의 배열로 변환 */
  const allInventoryRecords = useMemo(() => {
    const records: any[] = [];
    Array.from(inventoryMovement.entries()).forEach(([, data]) => {
      records.push(...data);
    });
    return records;
  }, [inventoryMovement]);

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
      itemCostDetail,
      itemProfitability,
      inventoryMovement: allInventoryRecords,
    }),
    [salesList, collectionList, orderList, orgProfit, teamContribution, profitabilityAnalysis, allAgingRecords, orgCustomerProfit, hqCustomerItemProfit, customerItemDetail, itemCostDetail, itemProfitability, allInventoryRecords]
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

  /** 데이터 품질 KPI 계산 */
  const totalRows = useMemo(() => {
    return salesList.length + collectionList.length + orderList.length
      + orgProfit.length + teamContribution.length + profitabilityAnalysis.length
      + allAgingRecords.length + orgCustomerProfit.length + hqCustomerItemProfit.length
      + customerItemDetail.length + itemCostDetail.length + itemProfitability.length
      + allInventoryRecords.length;
  }, [salesList, collectionList, orderList, orgProfit, teamContribution, profitabilityAnalysis, allAgingRecords, orgCustomerProfit, hqCustomerItemProfit, customerItemDetail, itemCostDetail, itemProfitability, allInventoryRecords]);

  const readyFileCount = useMemo(
    () => uploadedFiles.filter((f) => f.status === "ready").length,
    [uploadedFiles]
  );

  const lastUploadTime = useMemo(() => {
    if (uploadedFiles.length === 0) return null;
    const sorted = [...uploadedFiles].sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    return sorted[0].uploadedAt;
  }, [uploadedFiles]);

  const lastUploadLabel = useMemo(() => {
    if (!lastUploadTime) return "-";
    const d = new Date(lastUploadTime);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}일 전`;
  }, [lastUploadTime]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">데이터 관리</h2>
        <p className="text-muted-foreground">
          엑셀 파일을 업로드하여 대시보드 데이터를 관리합니다
        </p>
      </div>
      <FileUploader />

      {/* 데이터 품질 요약 KPI */}
      {(readyFileCount > 0 || totalRows > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="유효 행 수"
            value={totalRows}
            format="number"
            icon={<Database className="h-5 w-5" />}
            formula="모든 파일 유형의 데이터 행 수를 합산"
            description="현재 로드된 전체 데이터 행 수입니다. 파일 업로드 시 자동으로 갱신됩니다."
          />
          <KpiCard
            title="파일 수"
            value={readyFileCount}
            format="number"
            icon={<FileText className="h-5 w-5" />}
            formula="업로드 완료(ready) 상태인 파일 수"
            description="정상적으로 파싱이 완료된 엑셀 파일의 수입니다."
            benchmark={`전체 ${Object.keys(dataMap).length}개 유형 중 ${summary.loadedTypes}개 유형 로드됨`}
          />
          <KpiCard
            title="조직 수"
            value={orgNames.size}
            format="number"
            icon={<Building2 className="h-5 w-5" />}
            formula="업로드된 데이터에서 추출한 고유 영업조직 수"
            description="데이터에 포함된 영업조직의 수입니다. 조직 필터에 사용됩니다."
          />
          <KpiCard
            title="마지막 업로드"
            value={readyFileCount}
            format="number"
            icon={<Clock className="h-5 w-5" />}
            formula={lastUploadTime ? new Date(lastUploadTime).toLocaleString("ko-KR") : "업로드 이력 없음"}
            description={`마지막 업로드: ${lastUploadLabel}`}
          />
        </div>
      )}

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
                  <span className="text-sm font-normal text-muted-foreground ml-1">/ {Object.keys(dataMap).length}개</span>
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
