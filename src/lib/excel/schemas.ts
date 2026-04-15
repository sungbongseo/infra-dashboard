import type { FileType } from "@/types";

export interface FileSchema {
  fileType: FileType;
  pattern: RegExp;
  headerRow: number;
  hasMergedHeader: boolean;
  subHeaderRow?: number;
  orgFilterField?: string;
  /** 월별 시트 합산 전략: concat=모든 시트 합산(기본), latest=최신 시트만(누계 보고서) */
  monthlyStrategy?: "concat" | "latest";
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
    // 단월 데이터 — concat으로 전체 시트 합산 (기본값)
  },
  {
    fileType: "orgProfit",
    pattern: /조직별\s*(?!거래처)손익/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
    // 단월 데이터 — concat으로 전체 시트 합산 (기본값)
  },
  {
    fileType: "teamContribution",
    pattern: /팀원별\s*공헌이익/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
    // 단월 데이터 — concat으로 전체 시트 합산 (기본값)
  },
  {
    fileType: "itemProfitability",
    pattern: /품목별\s*수익성\s*분석\s*[\(\（]?\s*회계|200[.\s]*품목/i,
    headerRow: 0,
    hasMergedHeader: true, // 실제 skipRows=2 사용 (row 0=카테고리, row 1=계획/실적/차이)
    orgFilterField: "영업조직팀",
    // 200은 월별 독립 데이터 (누계 아님) — concat이 올바른 전략
    // 202504:196억→202505:32억 등 월별 변동 확인됨
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
    // 단월 데이터 — concat으로 전체 시트 합산 (기본값)
  },
  {
    fileType: "hqCustomerItemProfit",
    pattern: /본부\s*거래처\s*품목\s*손익|거래처\s*품목\s*손익/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
    // 단월 데이터 — concat으로 전체 시트 합산 (기본값)
  },
  {
    fileType: "customerItemDetail",
    pattern: /거래처별.*품목별\s*손익|100\s*거래처/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
    // 단월 데이터 — concat으로 전체 시트 합산 (기본값)
  },
  {
    fileType: "itemCostDetail",
    pattern: /품목별.*매출원가.*상세|501.*품목/i,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
    orgFilterField: "영업조직팀",
    // 단월 데이터 — concat으로 전체 시트 합산 (기본값)
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
  {
    fileType: "standardCostBook",
    // "양산공장 표준원가 3월31일 기준.xlsx", "청산공장 표준원가 ..."
    pattern: /표준원가.*기준|공장.*표준원가/,
    headerRow: 0,
    hasMergedHeader: false,
    // 같은 타입 다중 파일 업로드 시 concat (공장별 별도 파일)
  },
  {
    fileType: "manufacturingCost",
    // "픔목별 제조원가(1~3).xlsx" (픔=품 오타 포함)
    pattern: /(품목별|픔목별)\s*제조원가/,
    headerRow: 0,
    hasMergedHeader: true,
    subHeaderRow: 1,
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

/** 표준원가 파일명에서 공장 추출 ("양산공장 표준원가..." → "양산") */
export function getStandardCostFactory(fileName: string): string {
  if (/양산/.test(fileName)) return "양산";
  if (/청산|옥천/.test(fileName)) return "청산";
  if (/울산/.test(fileName)) return "울산";
  if (/용산/.test(fileName)) return "용산";
  return "unknown";
}

/**
 * 공장명 정규화 — 3개 소스 입력을 단일 키로 통합:
 *  1) 제조원가 파일 col 3: "청산공장(옥천)", "양산공장", "용산본사(석유)", "울산공장"
 *  2) 표준원가 파일명: "양산공장 표준원가...", "청산공장 표준원가..."
 *  3) 100 보고서 col 28: SAP 공장 코드 "0000", "1000", "2000", "4000"
 *
 * 출력: "양산" | "청산" | "울산" | "용산" | "unknown"
 */
export function normalizeFactoryName(raw: string): string {
  if (!raw) return "unknown";
  const trimmed = raw.trim();
  // SAP 공장 코드 (100 보고서) — 제조원가 파일의 코드 컬럼과 일치
  // 0000: 용산본사(석유), 1000: 울산공장, 2000: 청산공장(옥천), 4000: 양산공장
  if (trimmed === "0000") return "용산";
  if (trimmed === "1000") return "울산";
  if (trimmed === "2000") return "청산";
  if (trimmed === "4000") return "양산";
  // 한글 이름 매칭
  if (/양산/.test(trimmed)) return "양산";
  if (/청산|옥천/.test(trimmed)) return "청산";
  if (/울산/.test(trimmed)) return "울산";
  if (/용산/.test(trimmed)) return "용산";
  return trimmed.replace(/공장/g, "").replace(/\(.*\)/g, "").trim() || "unknown";
}
