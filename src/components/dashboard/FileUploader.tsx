"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useDataStore } from "@/stores/dataStore";
import { parseExcelFile } from "@/lib/excel/parser";
import { detectFileType } from "@/lib/excel/schemas";
import type { UploadedFile } from "@/types";
import { cn } from "@/lib/utils";

export function FileUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

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
    setReceivableAging,
    setCustomerLedger,
    clearAllData,
  } = useDataStore();

  const processFile = useCallback(
    async (file: File) => {
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
          errorMessage: "인식할 수 없는 파일 형식",
        });
        return;
      }

      const fileId = crypto.randomUUID();
      addUploadedFile({
        id: fileId,
        fileName: file.name,
        fileType: schema.fileType,
        uploadedAt: new Date(),
        rowCount: 0,
        status: "parsing",
      });

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
          case "receivableAging":
            setReceivableAging(result.sourceName || file.name, result.data as any[]);
            break;
          case "customerLedger":
            setCustomerLedger(result.data as any[]);
            break;
        }

        setProgress(100);
        updateUploadedFile(fileId, { status: "ready", rowCount: result.rowCount });
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
    [orgNames, addUploadedFile, updateUploadedFile, setOrganizations, setOrgCodes, setOrgNames, setSalesList, setCollectionList, setOrderList, setOrgProfit, setTeamContribution, setProfitabilityAnalysis, setReceivableAging, setCustomerLedger]
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
            파일을 드래그 앤 드롭하거나 클릭하여 선택하세요
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
              <Button variant="outline" size="sm" onClick={clearAllData}>
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
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
        <div>
          <p className="text-sm font-medium">{file.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {file.uploadedAt.toLocaleString("ko-KR")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {file.rowCount > 0 && `${file.rowCount.toLocaleString()}행`}
        </span>
        {file.status === "ready" && (
          <Badge variant="success" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            완료
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
  );
}
