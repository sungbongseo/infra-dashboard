import * as XLSX from "xlsx";
import type {
  Organization,
  SalesRecord,
  CollectionRecord,
  OrderRecord,
  OrgProfitRecord,
  TeamContributionRecord,
  ProfitabilityAnalysisRecord,
  ReceivableAgingRecord,
  CustomerLedgerRecord,
  PlanActualDiff,
  AgingAmounts,
} from "@/types";
import { detectFileType, getAgingSourceName } from "./schemas";

export interface ParseResult {
  fileType: string;
  data: unknown[];
  rowCount: number;
  sourceName?: string;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parsePlanActualDiff(row: unknown[], startIdx: number): PlanActualDiff {
  return {
    계획: num(row[startIdx]),
    실적: num(row[startIdx + 1]),
    차이: num(row[startIdx + 2]),
  };
}

function parseAgingAmounts(row: unknown[], startIdx: number): AgingAmounts {
  return {
    출고금액: num(row[startIdx]),
    장부금액: num(row[startIdx + 1]),
    거래금액: num(row[startIdx + 2]),
  };
}

function parseOrganization(data: unknown[][]): Organization[] {
  return data.slice(1).filter(r => r[0]).map((row) => ({
    영업조직: str(row[0]),
    영업조직명: str(row[1]),
    최하위조직여부: str(row[2]),
    시작일: str(row[3]),
    종료일: str(row[4]),
    통합조직여부: str(row[5]),
  }));
}

function parseSalesList(data: unknown[][]): SalesRecord[] {
  return data.slice(1).filter(r => r[0]).map((row) => ({
    No: num(row[0]),
    공장: str(row[1]),
    매출번호: str(row[2]),
    매출일: str(row[3]),
    세무분류: str(row[4]),
    세무구분: str(row[5]),
    거래처소분류: str(row[6]),
    매출처: str(row[7]),
    매출처명: str(row[8]),
    수금처: str(row[9]),
    수금처명: str(row[10]),
    납품처: str(row[11]),
    납품처명: str(row[12]),
    결제조건: str(row[13]),
    수금예정일: str(row[14]),
    매출상태: str(row[16]),
    매출유형: str(row[17]),
    품목: str(row[21]),
    품목명: str(row[22]),
    규격: str(row[23]),
    대분류: str(row[25]),
    중분류: str(row[26]),
    소분류: str(row[27]),
    단위: str(row[28]),
    수량: num(row[30]),
    거래통화: str(row[31]),
    환율: num(row[32]),
    판매단가: num(row[35]),
    판매금액: num(row[36]),
    장부단가: num(row[37]),
    장부금액: num(row[38]),
    부가세: num(row[39]),
    총금액: num(row[40]),
    영업조직: str(row[42]),
    유통경로: str(row[43]),
    제품군: str(row[44]),
    사업부: str(row[46]),
    영업그룹: str(row[47]),
    영업담당자: str(row[48]),
    영업담당자명: str(row[49]),
    수주번호: str(row[57]),
    수주유형: str(row[76]),
    출고일: str(row[64]),
  }));
}

function parseCollectionList(data: unknown[][]): CollectionRecord[] {
  return data.slice(1).filter(r => r[0]).map((row) => ({
    No: num(row[0]),
    수금문서번호: str(row[1]),
    수금유형: str(row[2]),
    결재방법: str(row[3]),
    수금계정: str(row[4]),
    거래처명: str(row[5]),
    영업조직: str(row[6]),
    담당자: str(row[7]),
    수금일: str(row[8]),
    통화: str(row[9]),
    수금액: num(row[16]),
    장부수금액: num(row[17]),
    선수금액: num(row[18]),
    장부선수금액: num(row[19]),
  }));
}

function parseOrderList(data: unknown[][]): OrderRecord[] {
  return data.slice(1).filter(r => r[0]).map((row) => ({
    No: num(row[0]),
    수주번호: str(row[1]),
    순번: num(row[2]),
    수주일: str(row[3]),
    납품요청일: str(row[4]),
    판매처: str(row[5]),
    판매처명: str(row[6]),
    영업그룹: str(row[7]),
    영업담당자: str(row[8]),
    영업담당자명: str(row[9]),
    판매지역: str(row[10]),
    수주유형: str(row[11]),
    수주유형명: str(row[12]),
    영업조직: str(row[13]),
    유통경로: str(row[14]),
    거래구분: str(row[15]),
    품목: str(row[18]),
    품목명: str(row[19]),
    규격: str(row[20]),
    판매수량: num(row[22]),
    판매단가: num(row[23]),
    판매금액: num(row[25]),
    환율: num(row[26]),
    장부단가: num(row[27]),
    장부금액: num(row[28]),
    부가세: num(row[29]),
    총금액: num(row[30]),
    대분류: str(row[41]),
    중분류: str(row[42]),
    소분류: str(row[43]),
  }));
}

function parseOrgProfit(data: unknown[][]): OrgProfitRecord[] {
  return data.slice(2).filter(r => r[0]).map((row) => ({
    No: num(row[0]),
    판매사업본부: str(row[1]),
    판매사업부: str(row[2]),
    영업조직팀: str(row[3]),
    매출액: parsePlanActualDiff(row, 4),
    실적매출원가: parsePlanActualDiff(row, 7),
    매출총이익: parsePlanActualDiff(row, 10),
    판관변동_직접판매운반비: parsePlanActualDiff(row, 13),
    판관변동_운반비: parsePlanActualDiff(row, 16),
    판매관리비: parsePlanActualDiff(row, 19),
    영업이익: parsePlanActualDiff(row, 22),
    공헌이익: parsePlanActualDiff(row, 25),
    매출원가율: parsePlanActualDiff(row, 28),
    매출총이익율: parsePlanActualDiff(row, 31),
    판관비율: parsePlanActualDiff(row, 34),
    영업이익율: parsePlanActualDiff(row, 37),
    공헌이익율: parsePlanActualDiff(row, 40),
  }));
}

function parseTeamContribution(data: unknown[][]): TeamContributionRecord[] {
  return data.slice(2).filter(r => r[0]).map((row) => ({
    No: num(row[0]),
    영업그룹: str(row[1]),
    영업조직팀: str(row[2]),
    영업담당사번: str(row[3]),
    매출액: parsePlanActualDiff(row, 4),
    실적매출원가: parsePlanActualDiff(row, 7),
    매출총이익: parsePlanActualDiff(row, 10),
    매출총이익율: parsePlanActualDiff(row, 13),
    판관변동_직접판매운반비: parsePlanActualDiff(row, 16),
    판매관리비: parsePlanActualDiff(row, 19),
    영업이익: parsePlanActualDiff(row, 22),
    영업이익율: parsePlanActualDiff(row, 25),
    변동비합계: parsePlanActualDiff(row, 109),
    공헌이익: parsePlanActualDiff(row, 112),
    공헌이익율: parsePlanActualDiff(row, 115 - 2),
  }));
}

function parseProfitabilityAnalysis(data: unknown[][]): ProfitabilityAnalysisRecord[] {
  return data.slice(2).filter(r => r[0]).map((row) => ({
    No: num(row[0]),
    영업조직팀: str(row[1]),
    영업담당사번: str(row[2]),
    매출거래처: str(row[3]),
    품목: str(row[4]),
    제품내수매출: parsePlanActualDiff(row, 5),
    제품수출매출: parsePlanActualDiff(row, 8),
    매출수량: parsePlanActualDiff(row, 11),
    환산수량: parsePlanActualDiff(row, 14),
    매출액: parsePlanActualDiff(row, 17),
    실적매출원가: parsePlanActualDiff(row, 20),
    매출총이익: parsePlanActualDiff(row, 23),
    판매관리비: parsePlanActualDiff(row, 26),
    판관변동_직접판매운반비: parsePlanActualDiff(row, 29),
    영업이익: parsePlanActualDiff(row, 32),
  }));
}

function parseReceivableAging(data: unknown[][]): ReceivableAgingRecord[] {
  return data.slice(2).filter(r => r[0]).map((row) => ({
    No: num(row[0]),
    영업조직: str(row[1]),
    담당자: str(row[2]),
    판매처: str(row[3]),
    판매처명: str(row[4]),
    통화: str(row[5]),
    month1: parseAgingAmounts(row, 6),
    month2: parseAgingAmounts(row, 9),
    month3: parseAgingAmounts(row, 12),
    month4: parseAgingAmounts(row, 15),
    month5: parseAgingAmounts(row, 18),
    month6: parseAgingAmounts(row, 21),
    overdue: parseAgingAmounts(row, 24),
    합계: parseAgingAmounts(row, 27),
  }));
}

function parseCustomerLedger(data: unknown[][]): CustomerLedgerRecord[] {
  return data.slice(1).filter(r => r[0]).map((row) => ({
    거래처: str(row[0]),
    거래처명: str(row[1]),
    계정코드: str(row[2]),
    계정명: str(row[3]),
    회계일: str(row[6]),
    적요: str(row[8]),
    차변: num(row[9]),
    대변: num(row[10]),
    잔액: num(row[11]),
    환종: str(row[12]),
    거래금액: num(row[13]),
    전표번호: str(row[15]),
    비용센터: str(row[18]),
    프로젝트명: str(row[20]),
  }));
}

export function parseExcelFile(
  buffer: ArrayBuffer,
  fileName: string,
  orgCodes?: Set<string>
): ParseResult {
  const schema = detectFileType(fileName);
  if (!schema) {
    throw new Error(`인식할 수 없는 파일: ${fileName}`);
  }

  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  let parsed: unknown[];

  switch (schema.fileType) {
    case "organization":
      parsed = parseOrganization(rawData);
      break;
    case "salesList":
      parsed = parseSalesList(rawData);
      break;
    case "collectionList":
      parsed = parseCollectionList(rawData);
      break;
    case "orderList":
      parsed = parseOrderList(rawData);
      break;
    case "orgProfit":
      parsed = parseOrgProfit(rawData);
      break;
    case "teamContribution":
      parsed = parseTeamContribution(rawData);
      break;
    case "profitabilityAnalysis":
      parsed = parseProfitabilityAnalysis(rawData);
      break;
    case "receivableAging":
      parsed = parseReceivableAging(rawData);
      break;
    case "customerLedger":
      parsed = parseCustomerLedger(rawData);
      break;
    default:
      throw new Error(`파서 미구현: ${schema.fileType}`);
  }

  // Apply org filter if available and applicable
  if (orgCodes && orgCodes.size > 0 && schema.orgFilterField && schema.fileType !== "organization") {
    const field = schema.orgFilterField;
    parsed = parsed.filter((row: any) => {
      const orgValue = row[field] || row["영업조직"] || row["영업조직팀"];
      return orgValue && orgCodes.has(String(orgValue));
    });
  }

  const result: ParseResult = {
    fileType: schema.fileType,
    data: parsed,
    rowCount: parsed.length,
  };

  if (schema.fileType === "receivableAging") {
    result.sourceName = getAgingSourceName(fileName);
  }

  return result;
}
