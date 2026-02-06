import * as XLSX from "xlsx";

/**
 * CSV 내보내기 (UTF-8 BOM 포함 - 한글 Excel 호환)
 */
export function exportToCSV(data: Record<string, any>[], fileName: string): void {
  if (!data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? "";
          const str = String(val);
          // 쉼표, 줄바꿈, 따옴표 포함 시 이스케이프
          if (str.includes(",") || str.includes("\n") || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ];

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });

  downloadBlob(blob, `${fileName}.csv`);
}

/**
 * XLSX 내보내기 (자동 컬럼 너비 조정)
 */
export function exportToXlsx(
  data: Record<string, any>[],
  fileName: string,
  sheetName = "Sheet1"
): void {
  if (!data.length) return;

  const ws = XLSX.utils.json_to_sheet(data);

  // 자동 컬럼 너비 계산
  const headers = Object.keys(data[0]);
  ws["!cols"] = headers.map((h) => {
    const maxLen = Math.max(
      h.length,
      ...data.map((row) => String(row[h] ?? "").length)
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
