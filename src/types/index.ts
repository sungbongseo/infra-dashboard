export * from "./organization";
export * from "./sales";
export * from "./orders";
export * from "./profitability";
export * from "./receivables";

export type FileType =
  | "organization"
  | "salesList"
  | "collectionList"
  | "orderList"
  | "orgProfit"
  | "teamContribution"
  | "profitabilityAnalysis"
  | "receivableAging"
  | "customerLedger";

export interface UploadedFile {
  id: string;
  fileName: string;
  fileType: FileType;
  uploadedAt: Date;
  rowCount: number;
  status: "parsing" | "ready" | "error";
  errorMessage?: string;
  warnings?: string[];
  filterInfo?: string;
  skippedRows?: number;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ComparisonPeriod {
  current: DateRange;
  previous: DateRange;
  label: string;
}

export interface KpiValue {
  label: string;
  value: number;
  previousValue?: number;
  format: "currency" | "percent" | "number";
  description?: string;
  formula?: string;
  benchmark?: string;
}

export interface PerformanceScore {
  salesScore: number;
  orderScore: number;
  profitScore: number;
  collectionScore: number;
  receivableScore: number;
  totalScore: number;
  rank: number;
  percentile: number;
}
