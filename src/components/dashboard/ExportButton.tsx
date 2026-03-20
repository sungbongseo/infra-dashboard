"use client";

import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCSV, exportToXlsx } from "@/lib/export";

interface ExportButtonProps {
  data: Record<string, any>[];
  fileName: string;
  format?: "csv" | "xlsx";
  sheetName?: string;
  className?: string;
}

/** 포맷된 한국어 통화 문자열을 원본 숫자로 복원 */
function stripFormattedValues(data: Record<string, any>[]): Record<string, any>[] {
  return data.map((row) => {
    const newRow: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      if (typeof val === "string") {
        // "1,234.5", "1,234", "-1,234.5" 패턴 → 숫자 변환
        const cleaned = val.replace(/,/g, "");
        if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
          newRow[key] = Number(cleaned);
          continue;
        }
        // "12.3억", "4,500만원", "1.2조" 패턴 → 숫자 변환
        const korMatch = val.match(/^(-?[\d,.]+)\s*(조|억|만원|만)\s*원?$/);
        if (korMatch) {
          const num = Number(korMatch[1].replace(/,/g, ""));
          const unit = korMatch[2];
          const multiplier = unit === "조" ? 1e12 : unit === "억" ? 1e8 : 1e4;
          newRow[key] = num * multiplier;
          continue;
        }
      }
      newRow[key] = val;
    }
    return newRow;
  });
}

export function ExportButton({
  data,
  fileName,
  format = "xlsx",
  sheetName,
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleExport = (rawNumbers: boolean) => {
    const exportData = rawNumbers ? stripFormattedValues(data) : data;
    if (format === "csv") {
      exportToCSV(exportData, rawNumbers ? `${fileName}_raw` : fileName);
    } else {
      exportToXlsx(exportData, rawNumbers ? `${fileName}_raw` : fileName, sheetName);
    }
    setOpen(false);
  };

  return (
    <div className="relative inline-block" ref={ref}>
      <div className="flex items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport(false)}
          disabled={!data.length}
          className={className}
        >
          <Download className="h-4 w-4 mr-1" />
          내보내기
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(!open)}
          disabled={!data.length}
          className="px-1 -ml-px rounded-l-none border-l-0"
          aria-label="내보내기 옵션"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[140px]">
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            onClick={() => handleExport(false)}
          >
            서식 포함
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            onClick={() => handleExport(true)}
          >
            원본 숫자
          </button>
        </div>
      )}
    </div>
  );
}
