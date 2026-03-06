import type { FileType } from "@/types";

export interface FileSchema {
  fileType: FileType;
  pattern: RegExp;
  headerRow: number;
  hasMergedHeader: boolean;
  subHeaderRow?: number;
  orgFilterField?: string;
}

export const FILE_SCHEMAS: FileSchema[] = [
  {
    fileType: "organization",
    pattern: /infra.*사업본부.*담당조직/i,
    headerRow: 0,
    hasMergedHeader: false,
  },
  {
    fileType: "salesList",
    pattern: /매출리스트/,
    headerRow: 0,
    hasMergedHeader: false,
    orgFilterField: "영업조직",
  },
  {
    fileType: "collectionList",
    pattern: /수금리스트/,
    headerRow: 0,
    hasMergedHeader: false,
    orgFilterField: "영업조직",
  },
  {
    fileType: "orderList",
    pattern: /수주리스트/,
    headerRow: 0,
    hasMergedHeader: false,
    orgFilterField: "영업조직",
  },
  {
    fileType: "orgCustomerProfit",
    pattern: /조직별\s*거래처별\s*손익/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
  },
  {
    fileType: "orgProfit",
    pattern: /조직별\s*(?!거래처)손익/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
  },
  {
    fileType: "teamContribution",
    pattern: /팀원별\s*공헌이익/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
  },
  {
    fileType: "itemProfitability",
    pattern: /품목별\s*수익성\s*분석\s*[\(\（]?\s*회계|200[.\s]*품목/i,
    headerRow: 0,
    hasMergedHeader: false,
    orgFilterField: "영업조직팀",
  },
  {
    fileType: "profitabilityAnalysis",
    // 901 SAP 보고서 또는 "담당자별/거래처별/품목별 수익성분석" 패턴
    // 주의: itemProfitability(200.품목별 수익성 분석(회계))가 먼저 매칭되어야 함 (index 7)
    pattern: /901.*수익성|수익성\s*분석|(담당자|거래처|품목)별?\s*수익성/i,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
  },
  {
    fileType: "hqCustomerItemProfit",
    pattern: /본부\s*거래처\s*품목\s*손익|거래처\s*품목\s*손익/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
  },
  {
    fileType: "customerItemDetail",
    pattern: /거래처별.*품목별\s*손익|100\s*거래처/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
  },
  {
    fileType: "itemCostDetail",
    pattern: /품목별.*매출원가.*상세|501.*품목/i,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
  },
  {
    fileType: "inventoryMovement",
    pattern: /품목별\s*수불현황/,
    headerRow: 0,
    hasMergedHeader: false,
  },
  {
    fileType: "receivableAging",
    pattern: /미수채권연령/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직",
  },
];

export function detectFileType(fileName: string): FileSchema | null {
  for (const schema of FILE_SCHEMAS) {
    if (schema.pattern.test(fileName)) {
      return schema;
    }
  }
  return null;
}

export function getAgingSourceName(fileName: string): string {
  const match = fileName.match(/^(.+?)_미수채권연령/);
  return match ? match[1] : fileName.replace(/\.xlsx$/i, "");
}

/** 수불현황 파일명에서 공장명 추출 (예: "품목별 수불현황_옥천.xlsx" → "옥천") */
export function getFactoryName(fileName: string): string {
  const match = fileName.match(/수불현황[_\s]?(.+?)\.xlsx?$/i);
  return match ? match[1].trim() : fileName.replace(/\.xlsx?$/i, "").trim();
}
