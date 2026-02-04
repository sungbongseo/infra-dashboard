"use client";

import { FileUploader } from "@/components/dashboard/FileUploader";

export default function DataManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">데이터 관리</h2>
        <p className="text-muted-foreground">
          엑셀 파일을 업로드하여 대시보드 데이터를 관리합니다
        </p>
      </div>
      <FileUploader />
    </div>
  );
}
