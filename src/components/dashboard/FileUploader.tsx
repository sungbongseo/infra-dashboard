"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Trash2, CheckCircle, AlertCircle, AlertTriangle, Loader2, Database } from "lucide-react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { parseExcelFile } from "@/lib/excel/parser";
import { detectFileType } from "@/lib/excel/schemas";
import { saveDataset, saveAgingData, saveOrgFilter, saveUploadedFiles, clearAllDB, hasStoredData } from "@/lib/db";
import type { StoredUploadedFile } from "@/lib/db";
import type { UploadedFile } from "@/types";
import { cn } from "@/lib/utils";

export function FileUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dbHasData, setDbHasData] = useState(false);
  const [restoredFromDB, setRestoredFromDB] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const {
    orgNames,
    uploadedFiles,
    addUploadedFile,
    updateUploadedFile,
    setOrganizations,
    setOrgCodes,
    setOrgNames,
    setSalesList,
    setCollectionList,
    setOrderList,
    setOrgProfit,
    setTeamContribution,
    setProfitabilityAnalysis,
    setOrgCustomerProfit,
    setHqCustomerItemProfit,
    setCustomerItemDetail,
    setItemCostDetail,
    setReceivableAging,
    clearAllData,
  } = useDataStore();

  const storeIsEmpty = uploadedFiles.length === 0;

  // Check if IndexedDB has stored data on mount
  useEffect(() => {
    hasStoredData()
      .then((has) => setDbHasData(has))
      .catch(() => setDbHasData(false));
  }, []);

  // Handle restore from IndexedDB
  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      await useDataStore.getState().restoreFromDB();
      await useFilterStore.getState().restoreFromDB();
      setRestoredFromDB(true);
      setDbHasData(false);
    } catch (err) {
      console.error("IndexedDB 복원 실패:", err);
    } finally {
      setRestoring(false);
    }
  }, []);

  // Handle clear all data including IndexedDB
  const handleClearAll = useCallback(() => {
    clearAllData();
    clearAllDB().catch((err) => console.error("IndexedDB 초기화 실패:", err));
    setDbHasData(false);
    setRestoredFromDB(false);
  }, [clearAllData]);

  const processFile = useCallback(
    async (file: File) => {
      // File size check (100MB)
      if (file.size > 100 * 1024 * 1024) {
        const fileId = crypto.randomUUID();
        addUploadedFile({
          id: fileId,
          fileName: file.name,
          fileType: "organization",
          uploadedAt: new Date(),
          rowCount: 0,
          status: "error",
          errorMessage: `파일 크기 초과: ${(file.size / 1024 / 1024).toFixed(1)}MB (최대 100MB)`,
        });
        return;
      }

      const schema = detectFileType(file.name);
      if (!schema) {
        const fileId = crypto.randomUUID();
        addUploadedFile({
          id: fileId,
          fileName: file.name,
          fileType: "organization",
          uploadedAt: new Date(),
          rowCount: 0,
          status: "error",
          errorMessage: "인식할 수 없는 파일 형식입니다. 파일명에 '매출리스트', '수주리스트' 등의 키워드가 포함되어야 합니다.",
        });
        return;
      }

      // Duplicate file detection
      const existing = uploadedFiles.find(
        (f) => f.fileName === file.name && f.status === "ready"
      );
      if (existing) {
        // Remove old entry before re-uploading
        updateUploadedFile(existing.id, { status: "parsing" });
      }

      const fileId = existing?.id || crypto.randomUUID();
      if (!existing) {
        addUploadedFile({
          id: fileId,
          fileName: file.name,
          fileType: schema.fileType,
          uploadedAt: new Date(),
          rowCount: 0,
          status: "parsing",
        });
      }

      setParsing(file.name);
      setProgress(10);

      try {
        const buffer = await file.arrayBuffer();
        setProgress(40);

        const result = parseExcelFile(buffer, file.name, orgNames.size > 0 ? orgNames : undefined);
        setProgress(80);

        // Store parsed data
        switch (result.fileType) {
          case "organization": {
            const orgs = result.data as any[];
            setOrganizations(orgs);
            const codes = new Set(orgs.map((o: any) => String(o.영업조직).trim()));
            setOrgCodes(codes);
            const names = new Set(orgs.map((o: any) => String(o.영업조직명).trim()));
            setOrgNames(names);
            // Re-filter already-loaded data against new org names
            const store = useDataStore.getState();
            const byName = (row: any) => names.has(String(row.영업조직 || "").trim());
            const byTeam = (row: any) => names.has(String(row.영업조직팀 || "").trim());
            if (store.salesList.length > 0)
              setSalesList(store.salesList.filter(byName));
            if (store.collectionList.length > 0)
              setCollectionList(store.collectionList.filter(byName));
            if (store.orderList.length > 0)
              setOrderList(store.orderList.filter(byName));
            if (store.orgProfit.length > 0)
              setOrgProfit(store.orgProfit.filter(byTeam));
            if (store.teamContribution.length > 0)
              setTeamContribution(store.teamContribution.filter(byTeam));
            if (store.profitabilityAnalysis.length > 0)
              setProfitabilityAnalysis(store.profitabilityAnalysis.filter(byTeam));
            if (store.orgCustomerProfit.length > 0)
              setOrgCustomerProfit(store.orgCustomerProfit.filter(byTeam));
            if (store.hqCustomerItemProfit.length > 0)
              setHqCustomerItemProfit(store.hqCustomerItemProfit.filter(byTeam));
            if (store.customerItemDetail.length > 0)
              setCustomerItemDetail(store.customerItemDetail.filter(byTeam));
            if (store.itemCostDetail.length > 0)
              setItemCostDetail(store.itemCostDetail.filter(byTeam));
            if (store.receivableAging.size > 0) {
              store.receivableAging.forEach((records, source) => {
                setReceivableAging(source, records.filter(byName));
              });
            }
            break;
          }
          case "salesList":
            setSalesList(result.data as any[]);
            break;
          case "collectionList":
            setCollectionList(result.data as any[]);
            break;
          case "orderList":
            setOrderList(result.data as any[]);
            break;
          case "orgProfit":
            setOrgProfit(result.data as any[]);
            break;
          case "teamContribution":
            setTeamContribution(result.data as any[]);
            break;
          case "profitabilityAnalysis":
            setProfitabilityAnalysis(result.data as any[]);
            break;
          case "orgCustomerProfit":
            setOrgCustomerProfit(result.data as any[]);
            break;
          case "hqCustomerItemProfit":
            setHqCustomerItemProfit(result.data as any[]);
            break;
          case "customerItemDetail":
            setCustomerItemDetail(result.data as any[]);
            break;
          case "itemCostDetail":
            setItemCostDetail(result.data as any[]);
            break;
          case "receivableAging":
            setReceivableAging(result.sourceName || file.name, result.data as any[]);
            break;
        }

        setProgress(100);
        updateUploadedFile(fileId, {
          status: "ready",
          rowCount: result.rowCount,
          warnings: result.warnings.length > 0 ? result.warnings : undefined,
          filterInfo: result.filterInfo,
          skippedRows: result.skippedRows > 0 ? result.skippedRows : undefined,
        });

        // Save to IndexedDB (fire-and-forget)
        switch (result.fileType) {
          case "organization": {
            const store = useDataStore.getState();
            saveOrgFilter(
              Array.from(store.orgNames),
              Array.from(store.orgCodes)
            ).catch((e) => console.error("IndexedDB 조직필터 저장 실패:", e));
            break;
          }
          case "salesList":
          case "collectionList":
          case "orderList":
          case "orgProfit":
          case "teamContribution":
          case "profitabilityAnalysis":
          case "orgCustomerProfit":
          case "hqCustomerItemProfit":
          case "customerItemDetail":
          case "itemCostDetail":
            saveDataset(result.fileType, result.data as any[]).catch((e) =>
              console.error("IndexedDB 데이터셋 저장 실패:", e)
            );
            break;
          case "receivableAging":
            saveAgingData(result.sourceName || file.name, result.data as any[]).catch((e) =>
              console.error("IndexedDB 에이징 저장 실패:", e)
            );
            break;
        }

        // Save uploaded files list to IndexedDB (fire-and-forget)
        const currentFiles = useDataStore.getState().uploadedFiles;
        const storedFiles: StoredUploadedFile[] = currentFiles
          .filter((f) => f.status === "ready" || f.status === "error")
          .map((f) => ({
            id: f.id,
            fileName: f.fileName,
            fileType: f.fileType,
            uploadedAt: f.uploadedAt,
            rowCount: f.rowCount,
            status: f.status,
            warnings: f.warnings,
            filterInfo: f.filterInfo,
            skippedRows: f.skippedRows,
          }));
        saveUploadedFiles(storedFiles).catch((e) =>
          console.error("IndexedDB 파일목록 저장 실패:", e)
        );
      } catch (err: any) {
        updateUploadedFile(fileId, {
          status: "error",
          errorMessage: err.message || "파싱 오류",
        });
      } finally {
        setParsing(null);
        setProgress(0);
      }
    },
    [orgNames, uploadedFiles, addUploadedFile, updateUploadedFile, setOrganizations, setOrgCodes, setOrgNames, setSalesList, setCollectionList, setOrderList, setOrgProfit, setTeamContribution, setProfitabilityAnalysis, setOrgCustomerProfit, setHqCustomerItemProfit, setCustomerItemDetail, setItemCostDetail, setReceivableAging]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
      );
      for (const file of files) {
        await processFile(file);
      }
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        await processFile(file);
      }
      e.target.value = "";
    },
    [processFile]
  );

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">엑셀 파일 업로드</h3>
          <p className="text-sm text-muted-foreground mb-4">
            파일을 드래그 앤 드롭하거나 클릭하여 선택하세요 (최대 100MB)
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            먼저 &apos;infra 사업본부 담당조직.xlsx&apos; 파일을 업로드하면 조직 필터링이 적용됩니다
          </p>
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
            <Button variant="outline" asChild>
              <span>파일 선택</span>
            </Button>
          </label>
        </CardContent>
      </Card>

      {/* Restore from IndexedDB */}
      {dbHasData && storeIsEmpty && !restoredFromDB && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  이전에 저장된 데이터가 있습니다
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  파일을 다시 업로드하지 않고 복원할 수 있습니다
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestore}
              disabled={restoring}
              className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
            >
              {restoring ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Database className="h-3.5 w-3.5 mr-1" />
              )}
              데이터 복원
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Restored from IndexedDB info */}
      {restoredFromDB && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
          <Database className="h-3.5 w-3.5 flex-shrink-0" />
          IndexedDB에서 데이터가 복원되었습니다. 새 파일을 업로드하면 기존 데이터를 덮어씁니다.
        </div>
      )}

      {/* Parsing Progress */}
      {parsing && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">{parsing} 파싱 중...</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* File Status Table */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">업로드된 파일</CardTitle>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                전체 초기화
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadedFiles.map((file) => (
                <FileRow key={file.id} file={file} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FileRow({ file }: { file: UploadedFile }) {
  const hasWarnings = file.warnings && file.warnings.length > 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          <div>
            <p className="text-sm font-medium">{file.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {file.uploadedAt.toLocaleString("ko-KR")}
              {file.filterInfo ? ` · ${file.filterInfo}` : ""}
              {file.skippedRows ? ` · ${file.skippedRows}행 스킵` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {file.rowCount > 0 && `${file.rowCount.toLocaleString()}행`}
          </span>
          {file.status === "ready" && !hasWarnings && (
            <Badge variant="success" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              완료
            </Badge>
          )}
          {file.status === "ready" && hasWarnings && (
            <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              경고
            </Badge>
          )}
          {file.status === "parsing" && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              파싱중
            </Badge>
          )}
          {file.status === "error" && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              오류
            </Badge>
          )}
        </div>
      </div>
      {/* Actual parsing warnings (not filter info) */}
      {hasWarnings && (
        <div className="ml-10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded">
          {file.warnings!.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      {/* Error details */}
      {file.status === "error" && file.errorMessage && (
        <div className="ml-10 px-3 py-1.5 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded">
          {file.errorMessage}
        </div>
      )}
    </div>
  );
}
