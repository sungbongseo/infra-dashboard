"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCSV, exportToXlsx } from "@/lib/export";

interface ExportButtonProps {
  data: Record<string, any>[];
  fileName: string;
  format?: "csv" | "xlsx";
  sheetName?: string;
  className?: string;
}

export function ExportButton({
  data,
  fileName,
  format = "xlsx",
  sheetName,
  className,
}: ExportButtonProps) {
  const handleExport = () => {
    if (format === "csv") {
      exportToCSV(data, fileName);
    } else {
      exportToXlsx(data, fileName, sheetName);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={!data.length}
      className={className}
    >
      <Download className="h-4 w-4 mr-1" />
      내보내기
    </Button>
  );
}
