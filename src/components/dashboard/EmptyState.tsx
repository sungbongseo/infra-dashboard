"use client";

import { Database, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function EmptyState() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Database className="h-16 w-16 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-semibold mb-2">데이터가 없습니다</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        엑셀 파일을 업로드하면 대시보드가 활성화됩니다.
        먼저 &apos;infra 사업본부 담당조직.xlsx&apos; 파일을 업로드하세요.
      </p>
      <Button onClick={() => router.push("/dashboard/data")}>
        <Upload className="h-4 w-4 mr-2" />
        데이터 업로드
      </Button>
    </div>
  );
}
