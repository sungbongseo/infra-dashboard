"use client";

import { Database, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface EmptyStateProps {
  requiredFiles?: string[];
}

export function EmptyState({ requiredFiles }: EmptyStateProps = {}) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Database className="h-16 w-16 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-semibold mb-2">데이터가 없습니다</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        {requiredFiles && requiredFiles.length > 0
          ? `이 분석에는 ${requiredFiles.join(", ")} 파일이 필요합니다. 데이터 관리에서 해당 파일을 업로드하세요.`
          : "엑셀 파일을 업로드하면 대시보드가 활성화됩니다. 먼저 'infra 사업본부 담당조직.xlsx' 파일을 업로드하세요."}
      </p>
      <Button onClick={() => router.push("/dashboard/data")}>
        <Upload className="h-4 w-4 mr-2" />
        데이터 업로드
      </Button>
    </div>
  );
}
